package handler

import (
	"fmt"
	"strconv"
	"strings"
	"sync"

	"micaps-web/db"
	"micaps-web/filecache"
)

// BlobRef specifies the Cassandra data path + file and the corresponding disk cache key parts
type BlobRef struct {
	Table       string // Cache key table
	SubDataPath string // Cache key subDataPath
	DataPath    string // Cassandra directory (as passed to db.GetBlob)
	File        string // Cassandra file
}

// BlobFetcher provides Cassandra or mock blob retrieval
type BlobFetcher interface {
	GetBlob(dataPath, file string) ([]byte, error)
}

// DBBlobFetcher wraps CQLClient to satisfy BlobFetcher
type DBBlobFetcher struct {
	Client *db.CQLClient
}

func (f *DBBlobFetcher) GetBlob(dataPath, file string) ([]byte, error) {
	if f.Client == nil {
		return nil, fmt.Errorf("missing CQL client connection")
	}
	return db.GetBlob(f.Client, dataPath, file)
}

// BlobFetcherFunc allows function closures to act as BlobFetcher
type BlobFetcherFunc func(dataPath, file string) ([]byte, error)

func (fn BlobFetcherFunc) GetBlob(dataPath, file string) ([]byte, error) {
	return fn(dataPath, file)
}

// BlobSource coordinates Cache and Cassandra fetch via Singleflight
type BlobSource struct {
	Fetcher BlobFetcher
	Cache   *filecache.Cache
	sfMu    sync.Mutex
	sf      *filecache.Singleflight
}

func NewBlobSource(fetcher BlobFetcher, cache *filecache.Cache) *BlobSource {
	return &BlobSource{
		Fetcher: fetcher,
		Cache:   cache,
	}
}

func (s *BlobSource) getSingleflight() *filecache.Singleflight {
	if s.Cache != nil && s.Cache.Singleflight() != nil {
		return s.Cache.Singleflight()
	}
	s.sfMu.Lock()
	defer s.sfMu.Unlock()
	if s.sf == nil {
		s.sf = filecache.NewSingleflight()
	}
	return s.sf
}

// GetOrFetch retrieves from Cache or fetches from Fetcher and saves to Cache
func (s *BlobSource) GetOrFetch(ref BlobRef) ([]byte, error) {
	if s.Cache != nil {
		if cachedBlob, _, ok := s.Cache.Get(ref.Table, ref.SubDataPath, ref.File); ok {
			return cachedBlob, nil
		}
	}

	sf := s.getSingleflight()
	cacheKey := filecache.Key(ref.Table, ref.SubDataPath, ref.File)

	return sf.Do(cacheKey, func() ([]byte, error) {
		if s.Cache != nil {
			if cachedBlob, _, ok := s.Cache.Get(ref.Table, ref.SubDataPath, ref.File); ok {
				return cachedBlob, nil
			}
		}
		if s.Fetcher == nil {
			return nil, fmt.Errorf("missing blob fetcher")
		}
		blob, err := s.Fetcher.GetBlob(ref.DataPath, ref.File)
		if err != nil {
			return nil, err
		}
		if s.Cache != nil {
			_ = s.Cache.Put(ref.Table, ref.SubDataPath, ref.File, blob, nil)
		}
		return blob, nil
	})
}

// Warm warms the disk cache for a BlobRef. Returns nil on hit or successful fetch.
func (s *BlobSource) Warm(ref BlobRef) error {
	if s.Cache == nil || s.Cache.IsDisabled() {
		return nil
	}
	if s.Cache.Has(ref.Table, ref.SubDataPath, ref.File) {
		s.Cache.Touch(ref.Table, ref.SubDataPath, ref.File)
		return nil
	}

	sf := s.getSingleflight()
	cacheKey := filecache.Key(ref.Table, ref.SubDataPath, ref.File)

	_, err := sf.Do(cacheKey, func() ([]byte, error) {
		if s.Cache.Has(ref.Table, ref.SubDataPath, ref.File) {
			s.Cache.Touch(ref.Table, ref.SubDataPath, ref.File)
			return nil, nil
		}
		if s.Fetcher == nil {
			return nil, fmt.Errorf("missing blob fetcher")
		}
		blob, err := s.Fetcher.GetBlob(ref.DataPath, ref.File)
		if err != nil {
			return nil, err
		}
		_ = s.Cache.PutPrefetched(ref.Table, ref.SubDataPath, ref.File, blob, nil)
		return blob, nil
	})
	return err
}

// CanonicalGridRef applies FY-4B channel injection and channel-prefix normalisation,
// then splits Table and SubDataPath.
func CanonicalGridRef(path, file, level string) (BlobRef, error) {
	dataPath := SanitizeGridPath(path)
	file = SanitizeFile(file)
	level = strings.TrimSpace(level)

	if dataPath == "" || file == "" {
		return BlobRef{}, fmt.Errorf("missing path or file")
	}
	if file == "latest" {
		return BlobRef{}, fmt.Errorf("cannot canonicalize unresolved 'latest' file")
	}

	// 1. FY-4B Channel Injection
	if (strings.Contains(dataPath, "FY4B/L1/CHINA") || strings.Contains(dataPath, "FY4B/L1/DISK")) && !strings.Contains(dataPath, "/C0") {
		var chanNum int
		if level != "" {
			if upper := strings.ToUpper(level); strings.HasPrefix(upper, "C") && len(upper) == 4 {
				if n, err := strconv.Atoi(upper[1:]); err == nil && n >= 1 && n <= 15 {
					chanNum = n
				}
			} else if n, err := strconv.Atoi(level); err == nil && n >= 1 && n <= 15 {
				chanNum = n
			}
		}
		if chanNum == 0 && file != "" {
			upperFile := strings.ToUpper(file)
			if strings.HasPrefix(upperFile, "C") && len(upperFile) >= 4 {
				if n, err := strconv.Atoi(upperFile[1:4]); err == nil && n >= 1 && n <= 15 {
					chanNum = n
				}
			}
		}
		if chanNum >= 1 && chanNum <= 15 {
			dataPath = fmt.Sprintf("%s/C%03d", dataPath, chanNum)
		}
	}

	// 2. Fallback level injection for FY-4B
	if level != "" {
		if (strings.Contains(dataPath, "FY4B/L1/CHINA") || strings.Contains(dataPath, "FY4B/L1/DISK")) && !strings.Contains(dataPath, "/C0") {
			if l, err := strconv.Atoi(level); err == nil && l >= 1 && l <= 15 {
				dataPath = fmt.Sprintf("%s/C%03d", dataPath, l)
			}
		}
	} else if (strings.HasSuffix(dataPath, "FY4B/L1/CHINA") || strings.HasSuffix(dataPath, "FY4B/L1/DISK")) && !strings.Contains(dataPath, "/C0") {
		dataPath = fmt.Sprintf("%s/C012", dataPath)
	}

	// 3. Defensive channel prefix normalization for FY-4B
	if strings.Contains(dataPath, "FY4B") && strings.Contains(dataPath, "/C0") {
		pList := strings.Split(dataPath, "/")
		targetChannel := pList[len(pList)-1]
		if strings.HasPrefix(targetChannel, "C0") && len(targetChannel) == 4 {
			if len(file) > 5 && strings.HasPrefix(file, "C0") && file[4] == '_' {
				fileChannel := file[0:4]
				if fileChannel != targetChannel {
					file = targetChannel + file[4:]
				}
			}
		}
	}

	// 4. Split Table / SubDataPath
	cleanDir := dataPath
	parts := strings.Split(cleanDir, "/")
	table := parts[0]
	var subDataPath string
	if len(parts) > 1 {
		subDataPath = strings.Join(parts[1:], "/")
	}
	if strings.Contains(cleanDir, "TLOGP") {
		table = "UPPER_AIR"
		subDataPath = "TLOGP"
	}

	return BlobRef{
		Table:       table,
		SubDataPath: subDataPath,
		DataPath:    dataPath,
		File:        file,
	}, nil
}

// CanonicalImageRef canonicalizes satellite raster image requests (e.g. FY-2G Dust RGB)
func CanonicalImageRef(path, file string) (BlobRef, error) {
	dataPath := SanitizeGridPath(path)
	file = SanitizeFile(file)

	if dataPath == "" || file == "" {
		return BlobRef{}, fmt.Errorf("missing path or file")
	}
	if file == "latest" {
		return BlobRef{}, fmt.Errorf("cannot canonicalize unresolved 'latest' file")
	}

	table := "SATELLITE"
	subDataPath := dataPath
	if strings.HasPrefix(dataPath, "SATELLITE/") {
		subDataPath = strings.TrimPrefix(dataPath, "SATELLITE/")
	} else {
		dataPath = "SATELLITE/" + dataPath
	}

	return BlobRef{
		Table:       table,
		SubDataPath: subDataPath,
		DataPath:    dataPath,
		File:        file,
	}, nil
}
