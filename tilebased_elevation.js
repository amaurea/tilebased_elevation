// Depends on lleaflet only for the CRS stuff. Could get rid of this dependency
// by replacing crs and latlng. But it isn't hat weird to include leaflet when working
// with tile-based data like this.

function TilebasedElevation(url, opts) {
	this.url   = url;
	this.opts = Object.assign({
		crs:       L.CRS.EPSG3857,
		tileSize:  256,
		zoom:      12,
		cacheSize: 100,
		decoder:   function(R,G,B,A) { return -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1); },
	}, opts);
	this.cache = {t:0, n:0, data:{}};

	// Main user-facting function.
	// Evaluate the elevation at the given points. Input can be a single
	// [lat,lng] or latLng object, or it can be a list of these. Teturns
	// the elevation for each given point in the same order. Result will be
	// a single number if just a single point was given, or a list of a list was
	// given.
	this.get = async function(points) {
		var scalar = false;
		// Handle scalar case by converting it to length-1 array
		if(points.lat != null || typeof points[0] == "number") {
			scalar = true;
			points = [points];
		}
		// Get the pix coordinates for each point, and group by tile
		var tilewise = {};
		var tilecoords = {}
		for(var i = 0; i < points.length; i++) {
			var pos  = L.latLng(points[i]);
			var pix  = this.opts.crs.latLngToPoint(pos, this.opts.zoom);
			var tx   = Math.floor(pix.x / this.opts.tileSize);
			var ty   = Math.floor(pix.y / this.opts.tileSize);
			var lx   = pix.x - tx*this.opts.tileSize;
			var ly   = pix.y - ty*this.opts.tileSize;
			var tind = [tx,ty];
			if(!(tind in tilewise)) {
				tilewise[tind] = [];
				tilecoords[tind] = tind;
			}
			tilewise[tind].push([i, lx, ly]);
		}
		// For each tile, get the tile data and evaluate it at the point locations
		var outer = this;
		async function handle_tile(ty, tx, tp) {
			var result = [];
			var data = await outer._getTileData(ty, tx);
			for(var i = 0; i < tp.length; i++) {
				var [ind, lx, ly] = tp[i];
				// Nearest neighbor
				lx = Math.floor(lx);
				ly = Math.floor(ly);
				result.push([ind, data[ly*outer.opts.tileSize+lx]]);
			}
			return result;
		}
		var promises = [];
		for(var id in tilewise) {
			var [tx,ty] = tilecoords[id], tp = tilewise[id];
			promises.push(handle_tile(tx,ty,tp));
		}
		// Wait for all the promises to resolve, and copy over the
		// elevations into the output, which will have the same order as the input
		return Promise.all(promises).then((results) => {
			// Construct our output array
			var elevations = new Array(points.length);
			// And copy over into it
			for(var i = 0; i < results.length; i++) {
				var result = results[i];
				for(var j = 0; j < result.length; j++) {
					var [ind,ele] = result[j];
					elevations[ind] = ele;
				}
			}
			// Undo list-wrapping for the case where we only sent in a single point
			if(scalar) elevations = elevations[0];
			return elevations;
		});
	}


	////////////   Helper functions b//////////////////

	this._getTileUrl = function(x,y) { return L.Util.template(this.url, {x:x, y:y, z:this.opts.zoom}); };
	this._cacheGet = function(url) {
		this.cache.data[url].t = ++this.cache.t;
		return this.cache.data[url].v;
	}
	this._cacheAdd = function(url, data) {
		this.cache.data[url] = {t: ++this.cache.t, v:data};
		this.cache.n++;
		// Remove the oldest element until we're below the max cache size
		while(this.cache.n > this.opts.cacheSize) {
			var tmin = null, umin = null;
			for(var u in this.cache.data) {
				if(tmin == null || this.cache.data[u].t < tmin) {
					tmin = this.cache.data[u].t;
					umin = u;
				}
			}
			delete this.cache.data[u];
			this.cache.n--;
		}
	}
	this._getTileData = async function(x,y) {
		// Get the data for the tile with tile coordinates x,y. Returns a promise
		// containing the tile data
		var url = this._getTileUrl(x,y);
		var outer = this;
		// Check if it's in the cache
		if(url in this.cache.data)
			return this._cacheGet(url);
		else {
			return new Promise((resolutionFunc, rejectionFunc) => {
				// Load image using XHR to handle mapbox's ocean tiles
				var xhr = new XMLHttpRequest();
				xhr.onreadystatechange = function() {
					if(this.readyState != 4) return;
					if(this.status == 200) {
						// Proper response. Turn into image and return
						var img = new Image();
						img.crossOrigin = "anonymous";
						img.onload = (e) => {
							var data = outer._decodeTile(img);
							outer._cacheAdd(url, data);
							resolutionFunc(data);
						};
						img.src = window.URL.createObjectURL(this.response);
					} else if(this.status == 404) {
						// Not found. But might be a mapbox ocean placeholder
						if(this.response.size < 40) {
							this.response.text().then(text => {
								if(text.search("Tile not found") >= 0) {
									var tsize = outer.opts.tileSize;
									var data  = new Float32Array(tsize*tsize);
									outer._cacheAdd(url, data);
									resolutionFunc(data);
								} else rejectionFunc(this);
							});
						} else rejectionFunc(this);
					} else rejectionFunc(this);
				};
				xhr.open("GET", url);
				xhr.responseType = "blob";
				xhr.send();
			});
		}
	};
	this._decodeTile = function(img) {
		// Get our raw image data using canvas. This will be RGBA
		var canvas    = document.createElement("canvas");
		canvas.width  = img.width;
		canvas.height = img.height;
		var npix      = img.width*img.height;
		var context   = canvas.getContext("2d");
		context.drawImage(img, 0, 0);
		var imgdata   = context.getImageData(0, 0, img.width, img.height);
		// Then decode RGBA to the height values, which will be a float32 array.
		var data      = new Float32Array(npix);
		for(var i = 0; i < npix; i++) {
			var R = imgdata.data[4*i+0];
			var G = imgdata.data[4*i+1];
			var B = imgdata.data[4*i+2];
			var A = imgdata.data[4*i+3];
			var height = this.opts.decoder(R,G,B,A);
			data[i] = height;
		}
		return data;
	};
}

function tilebasedElevation(url, opts) { return new TilebasedElevation(url, opts); }
