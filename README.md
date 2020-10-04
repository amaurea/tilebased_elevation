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
