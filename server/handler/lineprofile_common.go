package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"micaps-web/db"
	"micaps-web/filecache"
	"micaps-web/mock"
	"micaps-web/parser"
)

var (
	lineModelRegex = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
	lineCycleRegex = regexp.MustCompile(`^\d{8}$`)
)

// LineProfileProgressEvent mirrors ProfileHandler progress lines
type LineProfileProgressEvent struct {
	Type       string `json:"type"`
	Loaded     int    `json:"loaded"`
	Total      int    `json:"total"`
	Ok         int    `json:"ok"`
	Failed     int    `json:"failed"`
	CacheHits  int    `json:"cacheHits"`
	LastSource string `json:"lastSource"`
}

// TransectNodes holds server-authoritative along-line sample nodes
type TransectNodes struct {
	Lons    []float64
	Lats    []float64
	DistKm  []float64
	TotalKm float64
}

func haversineKm(lon0, lat0, lon1, lat1 float64) float64 {
	const R = 6371.0
	toRad := func(d float64) float64 { return d * math.Pi / 180.0 }
	dLat := toRad(lat1 - lat0)
	dLon := toRad(lon1 - lon0)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(toRad(lat0))*math.Cos(toRad(lat1))*math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Asin(math.Min(1, math.Sqrt(a)))
	return R * c
}

// angularSepDeg returns central-angle separation in degrees
func angularSepDeg(lon0, lat0, lon1, lat1 float64) float64 {
	const R = 6371.0
	d := haversineKm(lon0, lat0, lon1, lat1)
	// central angle = d / R radians -> degrees
	return d / R * 180.0 / math.Pi
}

// buildTransectNodes interpolates npoints along geodesic slerp.
// For <=2000 km, equirect lerp differs <0.5%; slerp is used always for uniformity.
func buildTransectNodes(lon0, lat0, lon1, lat1 float64, npoints int) TransectNodes {
	lons := make([]float64, npoints)
	lats := make([]float64, npoints)
	dist := make([]float64, npoints)
	if npoints == 1 {
		lons[0] = lon0
		lats[0] = lat0
		dist[0] = 0
		return TransectNodes{Lons: lons, Lats: lats, DistKm: dist, TotalKm: 0}
	}
	toRad := func(d float64) float64 { return d * math.Pi / 180.0 }
	toDeg := func(r float64) float64 { return r * 180.0 / math.Pi }
	// Convert endpoints to 3D unit vectors
	lat0r, lon0r := toRad(lat0), toRad(lon0)
	lat1r, lon1r := toRad(lat1), toRad(lon1)
	x0 := math.Cos(lat0r) * math.Cos(lon0r)
	y0 := math.Cos(lat0r) * math.Sin(lon0r)
	z0 := math.Sin(lat0r)
	x1 := math.Cos(lat1r) * math.Cos(lon1r)
	y1 := math.Cos(lat1r) * math.Sin(lon1r)
	z1 := math.Sin(lat1r)
	dot := x0*x1 + y0*y1 + z0*z1
	if dot > 1 {
		dot = 1
	}
	if dot < -1 {
		dot = -1
	}
	omega := math.Acos(dot)
	sinOmega := math.Sin(omega)
	for i := 0; i < npoints; i++ {
		t := float64(i) / float64(npoints-1)
		var x, y, z float64
		if sinOmega < 1e-10 {
			// Coincident/antipodal fallback: linear in lon/lat
			x = x0 + t*(x1-x0)
			y = y0 + t*(y1-y0)
			z = z0 + t*(z1-z0)
		} else {
			a := math.Sin((1-t)*omega) / sinOmega
			b := math.Sin(t*omega) / sinOmega
			x = a*x0 + b*x1
			y = a*y0 + b*y1
			z = a*z0 + b*z1
		}
		norm := math.Sqrt(x*x + y*y + z*z)
		if norm > 0 {
			x /= norm
			y /= norm
			z /= norm
		}
		lat := toDeg(math.Asin(math.Max(-1, math.Min(1, z))))
		lon := toDeg(math.Atan2(y, x))
		lons[i] = math.Round(lon*10000) / 10000
		lats[i] = math.Round(lat*10000) / 10000
	}
	total := haversineKm(lon0, lat0, lon1, lat1)
	cum := 0.0
	dist[0] = 0
	for i := 1; i < npoints; i++ {
		cum += haversineKm(lons[i-1], lats[i-1], lons[i], lats[i])
		dist[i] = cum
	}
	// Normalize so last == total (avoid drift)
	if npoints > 1 && cum > 0 {
		scale := total / cum
		if math.Abs(scale-1) < 0.05 {
			for i := range dist {
				dist[i] *= scale
			}
			dist[npoints-1] = total
		}
	}
	return TransectNodes{Lons: lons, Lats: lats, DistKm: dist, TotalKm: total}
}

func parseLonLat(q map[string][]string, get func(string) string, lonKey, latKey string) (float64, float64, error) {
	_ = q
	lonStr := get(lonKey)
	latStr := get(latKey)
	if lonStr == "" || latStr == "" {
		return 0, 0, fmt.Errorf("missing %s or %s parameter", lonKey, latKey)
	}
	lon, err := strconv.ParseFloat(lonStr, 64)
	if err != nil || math.IsNaN(lon) || lon < -180 || lon > 360 {
		return 0, 0, fmt.Errorf("invalid %s parameter", lonKey)
	}
	lat, err := strconv.ParseFloat(latStr, 64)
	if err != nil || math.IsNaN(lat) || lat < -90 || lat > 90 {
		return 0, 0, fmt.Errorf("invalid %s parameter", latKey)
	}
	return lon, lat, nil
}

func parseNPoints(s string) (int, error) {
	if s == "" {
		return 41, nil
	}
	v, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return 0, fmt.Errorf("invalid npoints: %s", s)
	}
	if v < 2 || v > 81 {
		return 0, fmt.Errorf("npoints %d out of range [2, 81]", v)
	}
	return v, nil
}

func parseLineCommon(w http.ResponseWriter, r *http.Request) (model string, cycle string, lon0, lat0, lon1, lat1 float64, npoints int, ok bool) {
	q := r.URL.Query()
	model = q.Get("model")
	if model == "" {
		model = "ECMWF_HR"
	}
	if !lineModelRegex.MatchString(model) {
		http.Error(w, "invalid model name", http.StatusBadRequest)
		return "", "", 0, 0, 0, 0, 0, false
	}
	cycle = q.Get("cycle")
	if !lineCycleRegex.MatchString(cycle) {
		http.Error(w, "invalid cycle: must be 8 digits (e.g. 26091808)", http.StatusBadRequest)
		return "", "", 0, 0, 0, 0, 0, false
	}
	var err error
	lon0, lat0, err = parseLonLat(q, q.Get, "lon0", "lat0")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return "", "", 0, 0, 0, 0, 0, false
	}
	lon1, lat1, err = parseLonLat(q, q.Get, "lon1", "lat1")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return "", "", 0, 0, 0, 0, 0, false
	}
	npoints, err = parseNPoints(q.Get("npoints"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return "", "", 0, 0, 0, 0, 0, false
	}
	rawQuery := r.URL.RawQuery
	if strings.Contains(rawQuery, "..") || strings.Contains(rawQuery, "%00") {
		http.Error(w, "invalid characters in query", http.StatusBadRequest)
		return "", "", 0, 0, 0, 0, 0, false
	}
	sep := angularSepDeg(lon0, lat0, lon1, lat1)
	if sep < 0.1 {
		http.Error(w, "degenerate transect: endpoints too close (angular sep < 0.1deg)", http.StatusBadRequest)
		return "", "", 0, 0, 0, 0, 0, false
	}
	return model, cycle, lon0, lat0, lon1, lat1, npoints, true
}

// lineBlobTask is one (element, pressure, lead) blob fetch + N-node sampling job.
type lineBlobTask struct {
	elementIdx int
	element    string
	rowIdx     int // level row (lineheight) or lead row (hovmoller)
	pressure   int // isobaric level, hPa
	lead       int // forecast hour
	table      string
	dataPath   string
	file       string
}

type lineBlobResult struct {
	task        lineBlobTask
	values      []float64 // scalar per node (RH/TMP/VVEL)
	uVals       []float64 // wind U per node
	vVals       []float64 // wind V per node
	valid       []bool
	snappedA    *parser.SampledPoint // node-0 sample (endpoint A snap)
	snappedB    *parser.SampledPoint // node-last sample (endpoint B snap)
	source      string
	err         error
	outOfDomain bool
}

type lineFetcher struct {
	Client   *db.CQLClient
	Cache    *filecache.Cache
	MockMode bool
}

func (f *lineFetcher) fetchDecompressed(task lineBlobTask) ([]byte, string, error) {
	subPath := ""
	parts := strings.Split(task.dataPath, "/")
	if len(parts) > 1 {
		subPath = strings.Join(parts[1:], "/")
	}
	// 1. file cache
	if f.Cache != nil {
		if cachedBlob, _, ok := f.Cache.Get(task.table, subPath, task.file); ok {
			if dec, err := parser.DecompressGzip(cachedBlob); err == nil {
				return dec, "cache", nil
			}
		}
	}
	// 2. mock
	if f.MockMode || f.Client == nil {
		mr := mock.GenerateMockGrid(task.element, float32(task.pressure), int32(task.lead))
		dec := parser.EncodeMICAPSDecompressed(mr)
		return dec, "mock", nil
	}
	// 3. cassandra with singleflight
	var rawBlob []byte
	if f.Cache != nil && f.Cache.Singleflight() != nil {
		cacheKey := filecache.Key(task.table, subPath, task.file)
		b, err := f.Cache.Singleflight().Do(cacheKey, func() ([]byte, error) {
			if cachedBlob, _, ok := f.Cache.Get(task.table, subPath, task.file); ok {
				return cachedBlob, nil
			}
			blob, err := db.GetBlob(f.Client, task.dataPath, task.file)
			if err != nil {
				return nil, err
			}
			_ = f.Cache.Put(task.table, subPath, task.file, blob, nil)
			return blob, nil
		})
		if err != nil {
			return nil, "cassandra", err
		}
		rawBlob = b
	} else {
		blob, err := db.GetBlob(f.Client, task.dataPath, task.file)
		if err != nil {
			return nil, "cassandra", err
		}
		if f.Cache != nil {
			_ = f.Cache.Put(task.table, subPath, task.file, blob, nil)
		}
		rawBlob = blob
	}
	dec, err := parser.DecompressGzip(rawBlob)
	if err != nil {
		return nil, "cassandra", err
	}
	return dec, "cassandra", nil
}

func (f *lineFetcher) processTask(ctx context.Context, task lineBlobTask, nodes TransectNodes) lineBlobResult {
	// ctx is context.Context compatible
	done := ctx.Done()
	select {
	case <-done:
		if ctx.Err() != nil {
			return lineBlobResult{task: task, err: ctx.Err(), source: "cancelled"}
		}
	default:
	}
	dec, source, err := f.fetchDecompressed(task)
	if err != nil {
		return lineBlobResult{task: task, err: err, source: source}
	}
	n := len(nodes.Lons)
	values := make([]float64, n)
	uVals := make([]float64, n)
	vVals := make([]float64, n)
	valid := make([]bool, n)
	var snappedA, snappedB *parser.SampledPoint
	anyOut := false
	outCount := 0
	for i := 0; i < n; i++ {
		sampled, sErr := parser.SampleGridPoint(dec, nodes.Lons[i], nodes.Lats[i], task.element)
		if sErr != nil {
			if isOutOfDomain(sErr) {
				outCount++
				continue
			}
			continue
		}
		if sampled == nil || !sampled.Valid {
			continue
		}
		if i == 0 {
			snappedA = sampled
		}
		if i == n-1 {
			snappedB = sampled
		}
		if task.element == "WIND" {
			uVals[i] = sampled.U
			vVals[i] = sampled.V
			valid[i] = true
		} else {
			values[i] = sampled.Scalar
			valid[i] = true
		}
		_ = anyOut
	}
	// Whole-segment-out-of-domain: all nodes out
	if outCount == n {
		return lineBlobResult{task: task, outOfDomain: true, err: parser.ErrOutOfDomain, source: source}
	}
	return lineBlobResult{task: task, values: values, uVals: uVals, vVals: vVals, valid: valid, snappedA: snappedA, snappedB: snappedB, source: source}
}

func isOutOfDomain(err error) bool {
	if err == nil {
		return false
	}
	return err.Error() == parser.ErrOutOfDomain.Error() ||
		strings.Contains(err.Error(), "out of grid domain")
}

func writeLineProgress(w http.ResponseWriter, flusher http.Flusher, loaded, total, ok, failed, cacheHits int, lastSource string) {
	evt := LineProfileProgressEvent{
		Type: "progress", Loaded: loaded, Total: total, Ok: ok, Failed: failed, CacheHits: cacheHits, LastSource: lastSource,
	}
	if b, err := json.Marshal(evt); err == nil {
		w.Write(b)
		w.Write([]byte("\n"))
		if flusher != nil {
			flusher.Flush()
		}
	}
}

func runLinePool(ctx context.Context, tasks []lineBlobTask, nodes TransectNodes, fetcher *lineFetcher, first lineBlobResult, apply func(lineBlobResult)) {
	// apply first already outside; this runs remainder with conc-6
	if len(tasks) <= 1 {
		return
	}
	remaining := tasks[1:]
	ch := make(chan lineBlobTask, len(remaining))
	for _, t := range remaining {
		ch <- t
	}
	close(ch)
	resCh := make(chan lineBlobResult, len(remaining))
	concurrency := 6
	if len(remaining) < concurrency {
		concurrency = len(remaining)
	}
	var wg sync.WaitGroup
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case t, ok := <-ch:
					if !ok {
						return
					}
					res := fetcher.processTask(ctx, t, nodes)
					select {
					case <-ctx.Done():
						return
					case resCh <- res:
					}
				}
			}
		}()
	}
	go func() {
		wg.Wait()
		close(resCh)
	}()
	for res := range resCh {
		apply(res)
		if ctx.Err() != nil {
			return
		}
	}
}

func exemptWriteDeadline(w http.ResponseWriter) {
	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Time{})
}
