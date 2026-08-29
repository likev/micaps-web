package db

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"net"
	"sync"
	"time"
)

// CQLClient provides a thread-safe CQL v4 binary protocol client
type CQLClient struct {
	addr    string
	conn    net.Conn
	mu      sync.Mutex
	timeout time.Duration
}

// NewCQLClient initializes and connects a new CQL v4 client
func NewCQLClient(addr string, timeout time.Duration) (*CQLClient, error) {
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	client := &CQLClient{
		addr:    addr,
		timeout: timeout,
	}
	if err := client.reconnect(); err != nil {
		return nil, err
	}
	return client, nil
}

func (c *CQLClient) reconnect() error {
	if c.conn != nil {
		c.conn.Close()
	}
	conn, err := net.DialTimeout("tcp", c.addr, c.timeout)
	if err != nil {
		return fmt.Errorf("failed to dial Cassandra at %s: %w", c.addr, err)
	}
	c.conn = conn
	if err := c.startup(); err != nil {
		c.conn.Close()
		c.conn = nil
		return fmt.Errorf("CQL STARTUP failed: %w", err)
	}
	return nil
}

func (c *CQLClient) startup() error {
	c.conn.SetDeadline(time.Now().Add(c.timeout))

	var body bytes.Buffer
	binary.Write(&body, binary.BigEndian, uint16(1)) // 1 entry map
	binary.Write(&body, binary.BigEndian, uint16(11))
	body.WriteString("CQL_VERSION")
	binary.Write(&body, binary.BigEndian, uint16(5))
	body.WriteString("3.3.1")

	// Frame header: version=4, flags=0, stream=1, opcode=1 (STARTUP)
	hdr := []byte{0x04, 0x00, 0x00, 0x01, 0x01}
	hdr = binary.BigEndian.AppendUint32(hdr, uint32(body.Len()))

	if _, err := c.conn.Write(append(hdr, body.Bytes()...)); err != nil {
		return err
	}

	resHdr := make([]byte, 9)
	if _, err := io.ReadFull(c.conn, resHdr); err != nil {
		return err
	}
	bodyLen := binary.BigEndian.Uint32(resHdr[5:9])
	resBody := make([]byte, bodyLen)
	if _, err := io.ReadFull(c.conn, resBody); err != nil {
		return err
	}
	if resHdr[4] != 0x02 { // Opcode 0x02 = READY
		return fmt.Errorf("expected READY opcode 0x02, got 0x%02x", resHdr[4])
	}
	return nil
}

// Row represents a decoded row with column values
type Row struct {
	Columns map[string][]byte
}

// Query executes a CQL query and parses rows from the RESULT frame
func (c *CQLClient) Query(queryStr string) ([]Row, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	rows, err := c.execute(queryStr)
	if err != nil {
		log.Printf("[CQL] Query failed, attempting reconnect: %v", err)
		if rErr := c.reconnect(); rErr == nil {
			return c.execute(queryStr)
		}
		return nil, err
	}
	return rows, nil
}

func (c *CQLClient) execute(queryStr string) ([]Row, error) {
	if c.conn == nil {
		return nil, fmt.Errorf("connection is closed")
	}
	c.conn.SetDeadline(time.Now().Add(c.timeout))

	queryBytes := []byte(queryStr)
	var body bytes.Buffer
	binary.Write(&body, binary.BigEndian, uint32(len(queryBytes)))
	body.Write(queryBytes)
	binary.Write(&body, binary.BigEndian, uint16(1)) // Consistency ONE
	body.WriteByte(0x00)                             // Flags

	hdr := []byte{0x04, 0x00, 0x00, 0x02, 0x07} // Opcode 0x07 = QUERY
	hdr = binary.BigEndian.AppendUint32(hdr, uint32(body.Len()))

	if _, err := c.conn.Write(append(hdr, body.Bytes()...)); err != nil {
		c.conn.Close()
		c.conn = nil
		return nil, err
	}

	resHdr := make([]byte, 9)
	if _, err := io.ReadFull(c.conn, resHdr); err != nil {
		c.conn.Close()
		c.conn = nil
		return nil, err
	}
	bodyLen := binary.BigEndian.Uint32(resHdr[5:9])
	if bodyLen > 64*1024*1024 { // Guard against corrupted frames (max 64MB)
		c.conn.Close()
		c.conn = nil
		return nil, fmt.Errorf("corrupted CQL frame: body length %d exceeds 64MB limit", bodyLen)
	}

	resBody := make([]byte, bodyLen)
	if _, err := io.ReadFull(c.conn, resBody); err != nil {
		c.conn.Close()
		c.conn = nil
		return nil, err
	}

	if resHdr[4] == 0x00 { // Opcode 0x00 = ERROR
		code := binary.BigEndian.Uint32(resBody[:4])
		msgLen := binary.BigEndian.Uint16(resBody[4:6])
		msg := string(resBody[6 : 6+msgLen])
		return nil, fmt.Errorf("CQL error (0x%04x): %s", code, msg)
	}

	if resHdr[4] != 0x08 { // Opcode 0x08 = RESULT
		return nil, fmt.Errorf("unexpected response opcode: 0x%02x", resHdr[4])
	}

	return parseRowsResult(resBody)
}

func parseRowsResult(body []byte) ([]Row, error) {
	if len(body) < 4 {
		return nil, nil
	}
	kind := binary.BigEndian.Uint32(body[:4])
	if kind != 2 { // 2 = ROWS
		return nil, nil // Void, Set_keyspace, etc.
	}

	offset := 4
	flags := binary.BigEndian.Uint32(body[offset : offset+4])
	offset += 4
	colCount := int(binary.BigEndian.Uint32(body[offset : offset+4]))
	offset += 4

	hasGlobalTableSpec := (flags & 0x0001) != 0
	if hasGlobalTableSpec {
		ksLen := int(binary.BigEndian.Uint16(body[offset : offset+2]))
		offset += 2 + ksLen
		tblLen := int(binary.BigEndian.Uint16(body[offset : offset+2]))
		offset += 2 + tblLen
	}

	colNames := make([]string, colCount)
	for i := 0; i < colCount; i++ {
		if !hasGlobalTableSpec {
			ksLen := int(binary.BigEndian.Uint16(body[offset : offset+2]))
			offset += 2 + ksLen
			tblLen := int(binary.BigEndian.Uint16(body[offset : offset+2]))
			offset += 2 + tblLen
		}
		nameLen := int(binary.BigEndian.Uint16(body[offset : offset+2]))
		offset += 2
		colNames[i] = string(body[offset : offset+nameLen])
		offset += nameLen
		offset += 2 // col type
	}

	rowCount := int(binary.BigEndian.Uint32(body[offset : offset+4]))
	offset += 4

	results := make([]Row, rowCount)
	for r := 0; r < rowCount; r++ {
		row := Row{Columns: make(map[string][]byte, colCount)}
		for c := 0; c < colCount; c++ {
			valLen := int32(binary.BigEndian.Uint32(body[offset : offset+4]))
			offset += 4
			if valLen >= 0 {
				valBytes := make([]byte, valLen)
				copy(valBytes, body[offset:offset+int(valLen)])
				offset += int(valLen)
				row.Columns[colNames[c]] = valBytes
			} else {
				row.Columns[colNames[c]] = nil
			}
		}
		results[r] = row
	}
	return results, nil
}

// Close terminates the client connection
func (c *CQLClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}
