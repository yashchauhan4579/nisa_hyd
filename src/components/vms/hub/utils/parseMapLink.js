export function parseLatLng(url) {
  const pinMatch = url.match(/!8m2!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/)
  if (pinMatch) return { lat: pinMatch[1], lng: pinMatch[2] }
  const dataMatch = url.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/)
  if (dataMatch) return { lat: dataMatch[1], lng: dataMatch[2] }
  const qMatch = url.match(/[?&](?:q|query)=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/)
  if (qMatch) return { lat: qMatch[1], lng: qMatch[2] }
  const pathMatch = url.match(/\/(?:place|search)\/(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/)
  if (pathMatch) return { lat: pathMatch[1], lng: pathMatch[2] }
  const llMatch = url.match(/[?&]ll=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/)
  if (llMatch) return { lat: llMatch[1], lng: llMatch[2] }
  const atMatch = url.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/)
  if (atMatch) return { lat: atMatch[1], lng: atMatch[2] }
  return null
}

export async function extractLatLngFromMapsUrl(url) {
  if (/goo\.gl\/|maps\.app\.goo\.gl/.test(url)) {
    try {
      const res = await fetch(`/api/utils/resolve-url?url=${encodeURIComponent(url)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      return parseLatLng(data.url || '')
    } catch {
      return null
    }
  }
  return parseLatLng(url)
}
