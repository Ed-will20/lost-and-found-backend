// Server-side geocoding for manually-entered item locations.
// Requires GEOCODING_API_KEY -- a separate, API-restricted Google Maps
// Platform key (restricted to the Geocoding API only, no application
// restriction, since Railway does not provide a static outbound IP).
// This is intentionally a different key than the browser-side
// VITE_GOOGLE_MAPS_API_KEY used for Places/Maps JS.
const GEOCODING_API_KEY = process.env.GEOCODING_API_KEY;

// Attempts to geocode an address into { lat, lng }. Returns null on any
// failure (missing key, no results, network error, etc) -- callers should
// treat a null result as "leave lat/lng unset" rather than failing the
// whole request, since manual-entry items are expected to work fine
// without coordinates (they just won't appear in Near Me search).
exports.geocodeAddress = async ({ address, city, state, zip }) => {
  if (!GEOCODING_API_KEY) {
    console.warn('GEOCODING_API_KEY not set -- skipping geocode');
    return null;
  }

  const parts = [address, city, state, zip].filter(Boolean);
  if (parts.length === 0) return null;

  const query = parts.join(', ');

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GEOCODING_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      console.warn('Geocode returned no results for:', query, data.status);
      return null;
    }

    const location = data.results[0].geometry.location;
    return { lat: location.lat, lng: location.lng };
  } catch (error) {
    console.error('Geocode error:', error);
    return null;
  }
};
