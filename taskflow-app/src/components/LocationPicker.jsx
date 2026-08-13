import { useState, useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Leaflet's default marker resolves its icon through image URLs that bundlers
// rewrite, which is the classic "broken marker" problem. A divIcon sidesteps
// asset resolution entirely.
const PIN = L.divIcon({
  className: '',
  html: `<div style="
    width:22px;height:22px;border-radius:50% 50% 50% 0;
    background:#1d4ed8;border:2.5px solid #fff;
    transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.35);
  "></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
})

// Centre of the Philippines — a sane starting view for a PHILFIDA travel order.
const PH_CENTER = [12.8797, 121.774]

// Photon rather than Nominatim: Nominatim's /search matches whole tokens, so a
// partial like "Las" returns nothing at all. Photon is OSM's search-as-you-type
// geocoder and returns "Las Piñas" for that same input. Both are free and
// key-less. Requests stay debounced to respect fair use.
const PHOTON = 'https://photon.komoot.io'
// Bias results to the Philippines; PHILFIDA travel is domestic.
const PH_BBOX = '116.9,4.6,126.6,21.2'

/** Photon returns GeoJSON; flatten a feature into a display label + coords. */
function toPlace(feature) {
  const p = feature.properties || {}
  const [lng, lat] = feature.geometry?.coordinates || []
  const label = [p.name, p.street, p.district, p.city, p.state, p.country]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)   // drop repeats like "Cebu, Cebu"
    .join(', ')
  return { id: `${p.osm_type || ''}${p.osm_id || ''}-${lat},${lng}`, label, lat, lng }
}

async function searchPlaces(query) {
  const url = `${PHOTON}/api/?q=${encodeURIComponent(query)}&limit=8&lang=en&bbox=${PH_BBOX}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`search failed (${res.status})`)
  const data = await res.json()
  const places = (data.features || []).map(toPlace).filter(pl => pl.label && pl.lat != null)
  // Photon repeats some entries (e.g. a bridge mapped as two ways) — dedupe by
  // label so all five visible slots carry a distinct choice.
  const seen = new Set()
  return places.filter(pl => !seen.has(pl.label) && seen.add(pl.label)).slice(0, 5)
}

async function reverseGeocode(lat, lng) {
  const url = `${PHOTON}/reverse?lat=${lat}&lon=${lng}&lang=en`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`reverse failed (${res.status})`)
  const data = await res.json()
  const first = (data.features || [])[0]
  return first ? toPlace(first).label : ''
}

/**
 * Address search + draggable pin. Reports { address, lat, lng } upward.
 * `value` is the current address text so the field still works as plain text
 * if the network (or Nominatim) is unavailable — typing alone is always valid.
 */
export default function LocationPicker({ value, onChange, accent = 'blue', initialCoords = null }) {
  const [query, setQuery]       = useState(value || '')
  const [results, setResults]   = useState([])
  const [open, setOpen]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [coords, setCoords]     = useState(initialCoords)

  const mapRef    = useRef(null)   // Leaflet map instance
  const markerRef = useRef(null)
  const boxRef    = useRef(null)   // map container element
  const skipSearchRef = useRef(false)

  const ring = accent === 'red' ? 'focus:ring-red-500/20 focus:border-red-500' : 'focus:ring-blue-500/20 focus:border-blue-500'

  const commit = useCallback((address, lat, lng) => {
    setCoords(lat != null ? { lat, lng } : null)
    onChange({ address, lat: lat ?? null, lng: lng ?? null })
  }, [onChange])

  // ── Map bootstrap (once) ────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !boxRef.current) return
    const map = L.map(boxRef.current, {
      center: PH_CENTER,
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)

    // Dropping or dragging the pin resolves back to a human-readable address.
    const place = async (lat, lng) => {
      setPin(lat, lng)
      setLoading(true)
      setError('')
      try {
        const address = await reverseGeocode(lat, lng)
        skipSearchRef.current = true
        setQuery(address)
        commit(address, lat, lng)
      } catch {
        setError('Could not resolve that point to an address — you can type it manually.')
        commit(query, lat, lng)
      } finally {
        setLoading(false)
      }
    }

    map.on('click', (e) => place(e.latlng.lat, e.latlng.lng))
    mapRef.current = map

    // Restore a previously pinned location when editing an existing entry.
    if (initialCoords?.lat != null && initialCoords?.lng != null) {
      setPin(initialCoords.lat, initialCoords.lng)
    }

    // The container is hidden/animated when the modal opens, so Leaflet may
    // measure it at zero height. Recalculate once it has settled.
    const t = setTimeout(() => map.invalidateSize(), 250)
    return () => {
      clearTimeout(t)
      map.remove()
      mapRef.current = null
      // The marker belonged to the map just destroyed. Leaving the ref set makes
      // the next setPin() call move a detached marker, so no pin appears on the
      // fresh map — visible on any remount, including StrictMode's double-mount.
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setPin(lat, lng) {
    const map = mapRef.current
    if (!map) return
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng])
    } else {
      const m = L.marker([lat, lng], { icon: PIN, draggable: true }).addTo(map)
      m.on('dragend', async () => {
        const { lat: la, lng: ln } = m.getLatLng()
        setLoading(true)
        try {
          const address = await reverseGeocode(la, ln)
          skipSearchRef.current = true
          setQuery(address)
          commit(address, la, ln)
        } catch {
          commit(query, la, ln)
        } finally {
          setLoading(false)
        }
      })
      markerRef.current = m
    }
    map.setView([lat, lng], Math.max(map.getZoom(), 15))
  }

  // ── Debounced search ────────────────────────────────────────────────────
  useEffect(() => {
    if (skipSearchRef.current) { skipSearchRef.current = false; return }
    const q = query.trim()
    // Typing is always a valid address on its own; coordinates are a bonus.
    onChange({ address: query, lat: coords?.lat ?? null, lng: coords?.lng ?? null })
    if (q.length < 2) { setResults([]); setOpen(false); return }

    const t = setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const found = await searchPlaces(q)
        setResults(found)
        setOpen(found.length > 0)
        if (found.length === 0) setError('No match yet — keep typing, or enter the address manually.')
      } catch {
        setError('Address lookup unavailable — you can still type the address manually.')
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 450)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  function choose(r) {
    skipSearchRef.current = true
    setQuery(r.label)
    setOpen(false)
    setResults([])
    setPin(r.lat, r.lng)        // pin jumps to the picked place
    commit(r.label, r.lat, r.lng)
  }

  return (
    <div className="space-y-1">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
        Location / Venue
      </label>

      <div className="relative">
        <input
          className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 pr-9 text-sm transition-all font-medium focus:ring-2 ${ring}`}
          placeholder="Search a place, or type the address"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
        )}

        {open && results.length > 0 && (
          <ul className="absolute z-[10000] mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            {results.map(r => (
              <li key={r.id}>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => choose(r)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs leading-snug text-slate-700 hover:bg-slate-50"
                >
                  <i className="bi bi-geo-alt mt-0.5 flex-shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="min-w-0">{r.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        ref={boxRef}
        className="h-40 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
        style={{ zIndex: 0 }}
      />

      <p className="mb-0 flex items-center justify-between gap-2 text-[10px] leading-tight">
        <span className={error ? 'text-amber-600' : 'text-slate-400'}>
          {error || 'Tap the map or drag the pin to adjust.'}
        </span>
        {coords && (
          <span className="flex-shrink-0 font-mono text-slate-400">
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </span>
        )}
      </p>
    </div>
  )
}
