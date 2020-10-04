# tilebased\_elevation.js
tilebased\_elevation.js is a javascript wrapper that provides simple and efficient read-out
of elevation values at arbitrarily defined points for services like Mapbox that only
provide an elevation API for accessing data in the form of raster tiles.

## Motivation
I needed elevation data for a project in 2020, and after a quick search I found
several options:

* Google Elevation API:
    * $4-5 per 1000 requests
    * Max 500,000 requests per month
    * Max 100 requests per second
    * Max 512 locations per request (but somtimes you need one location right now, which would count as a whole request)
    * 10 m resolution
* Open-Elevation Public API
    * Free
    * 250 m resolution
    * Only covers -56° < latitude < 60°
* Elevation-API (elevation-api.io)
    * 5 km resolution (free)
    * 5-30 m resolution for $0.2 per 1000 requests
    * Max 33 requests per second
    * Max 10 locations per request

So basically one had to choose between horrible resolution or paying per request.
However, I already had a free mapbox account, and it turns out that mapbox also provides
elevation data, just in the form of tile data rather than as a simple text API. Here's
what that looks like in comparison:

* Mapbox elevation API
    * Free
    * Max 50,000 page sessions per month
    * Unlimited elevation tiles per session
    * 5 m resolution (configurable - default is 40 m)
    * Hard to use

Aside from the hard to use part, it looked much better than the stanard options.
So all I needed was a wrapper that would mek this API just as easy to use as the others.
tilebased\_elevation.js is an attempt at this.

## Usage
tilebased\_elevation.js depends on Leaflet for describing the projection of the tiles,
so it must be loaded first. The usage itself is very simple. Just initialize an api
object using the tilebasedElevation constructor, providing the tile path and api key,
and then use the `.get()` function to query it asynchronously. Here's a stand-alone usage
example:

```html
<script src=leaflet.js></script>
<script src=tilebased_elevation.js></script>
<script>
  var api = tilebasedElevation("https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token=pk.eyJ1Ijoic2lndXJka24iLCJhIjoiY2lzYzBlbmhvMDAxcDJ5bWthMzV1YzljNSJ9.oJmwqXsUxgVLZv6ucSn5CQ");
  // Get a single elevation, and print it to the console
  api.get([29.8,83.6]).then(el => console.log(el));
  // Get elevations for a line of 10,000 points in India/Nepal/China starting from lat = 25° and ending at lat = 30°
  var points = [];
  for(var i = 0; i < 10000; i++)
    points.push([25.0+i*5e-4,83.6])
  api.get(points).then(els => console.log(els));
  // Or you can use it with await if you're in an async function
  // els = await api.get(points);
</script>
```

The two user-facing functions are:

### `tilebasedElevation(url, opts)`
This function constructs an api object for the given tile url (including any api key)
and an optional dicitonary of options, which can contain the following entries:

* zoom: The resolution of the elevation tiles queried. Defaults to 12, corresponding to a resolution of 40 m at the equator. The maximum meaningful value is 15, which results in 5 m resolution. Higher values typically mean that more tiles need to be loaded when you ask for points covering a wide area, so there is a resolution/speed tradeoff.
* cacheSize: The number of tiles to cache tiles internally. Defaults to 100. Uses tileSize\*tileSize\*4 = 0.25 MB of memory per tile for the standard tile size of 256 pixels.
* decoder: The function used to decode the raw RGB data in the images to elevation values. Defaults to `function(R,G,B,A) { return -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1); }`, which is appropriate for MapBox elevation data.
* crs: The projection used for the tiles. Defaults to L.CRS.EPSG3857 (Web-Mercator). You probably won't need to change this.
* tileSize: The size of each tile, in pixels. Defaults to 256, which is the standard for Web-Mercator maps.

### `.get(points)`
The `.get()` method of the api object takes a single argument which can either be a single
latitude, longitude coordinate pair in the format of [lat,lng] or a Leaflet LatLng object;
or a list of such coordinate pairs. The output will be a single elevation in the former case
and a list in the latter case. Longitudes and latitudes are given in degrees, and elevations
are returned in meters above sea level.

## Implementation
Internally the api object maintains a cache of decoded tile data. When it is queried with one or more
points using the `.get()` method, it splits these into groups based on which tile they hit, look up
the corresponding tile data in the cache and fetch it from the server if necessary, and then read off
the elevation value from the pixel that's closest to each point. The elevation values are then collected
and returned as a list with the same ordering as the points that were input.

The tiles and caching mean that it's cheap to ask for lots of points in a local area, but inefficient to
ask for points scattered over a large area.
