/*jslint browser: true, white: true, stupid: true, vars: true*/
var has_require = typeof require !== 'undefined';
if (has_require) {
	d3 = require ("../vendor/js/d3.js");
}

!function() {
	var d3Table = function () {
		var filteredData = [], filter = [];
		var orderKey = null;
		var orderDirs = ["asc", "desc"];
		var rotates = [0, 180];
		var orderDir = orderDirs[0];
		var page = 0;
		var pageSize = 20;
		var selection = null;
		var postUpdate = null;
		var preExit = null;
		var pageCount = 1;
		var dispatch;

		var d3v3 = d3.version[0] === "3";
		
		// Zero is a valid value for a filter
		function filterHasContent (filter) {
			return filter || (filter === 0);
		}

		var preprocessFilterInputFuncs = {
			alpha: function (filterVal) {
				// Strings split by spaces and entries must later match all substrings: As asked for by lutz and worked in the old table - issue 139
				var parts = filterVal ? filterVal.split(" ").map (function (part) { return "(?=.*"+part+")"; }) : [];
				return new RegExp (parts.length > 1 ? parts.join("") : filterVal, "i");
			},
			numeric: function (filterVal) { return filterHasContent(filterVal) ? filterVal.toString().split(" ").map (function (part) { return Number(part); }) : filterVal; },
			boolean: function (filterVal) { return toBoolean (filterVal); },
		}

		var filterByTypeFuncs = {
			alpha: function (datum, regex) { return regex.test(datum) > 0; /* return datum.search(regex) >= 0; */ },
			numeric: function (datum, range) { return range.length <= 1 ? +datum === range[0] : (datum >= range[0] && datum <= range[1]); },
			boolean: function (datum, bool) { return toBoolean (datum, true) === bool; }													   
		};

		var comparators = {
			alpha: function (a, b) { return a.localeCompare(b); },
			numeric: function (a, b) { return a - b; },
			boolean: function (a, b) { 
				var aBool = toBoolean(a); 
				return aBool === toBoolean(b) ? 0 : (aBool ? 1 : -1); 
			}
		};

		var cache = {};

		function toBoolean (val, nullIsFalse) {
			return (val === "1" || val === "t" || val === "true" || val === true) ? true : ((val === "0" || val === "f" || val === "false" || val === false || (val === null && nullIsFalse)) ? false : null);
		}

		function my (mySelection) {	// data in selection should be 2d-array [[]] or single empty array [] for empty tables
			selection = mySelection;
			filteredData = my.getData();
			
			selection.classed (".d3tableContainer", true);

			if (selection.select("table").empty()) {

				function addPageWidget (elem, childNodeType) {
					//console.log ("elem", elem, "this", this, "args", arguments);
					elem.attr("class", "d3tableControls d3table-pagerInfo");
					var pageInfo = elem.append(childNodeType || "span").attr("class", "d3table-pageInfo");
					
					pageInfo.append("span")
						.attr("class", "d3table-pageInput")
						.append ("input")
							.attr ("type", "number")
							.attr ("length", 3)
							.attr ("min", 1)
							.attr ("value", 1)
							.on ("input", function () {
								var val = d3.select(this).property("value");
								if (val !== "") {
									my.page(val).update();
								}
							})
					;
					pageInfo.append("span").attr("class", "d3table-pageTotal");
				}
				
				selection.append("div").call(addPageWidget);	// add top page control

				var wrapperTable = selection.append("div").attr("class", "d3table-wrapper");
				var table = wrapperTable.append("table").attr("class", "d3table");
				table.append("thead").selectAll("tr").data([0,1]).enter().append("tr");
				table.append("tbody");
				table.append("tfoot").append("tr").call(addPageWidget, "td");	// add bottom page control
			}

			buildHeaders ();
			hideFilters ();
			hideOrderWidgets ();

			doPageCount();

			function setPageWidget (page) {
				selection.selectAll(".d3table-pageInput input[type='number']").property ("value", page);
			};

			function setOrderButton (key) {
				var order = orderDirs.indexOf (orderDir);
				var rotate = rotates[order];
				selection.selectAll("svg.d3table-arrow")
					.style ("transform", null).classed("d3table-active", false)
					.filter (function (d) { return d.key === key; })
					.style ("transform", "rotate("+rotate+"deg)").classed("d3table-active", true)
				;
			};

			dispatch = d3.dispatch ("columnHiding", "filtering", "ordering", "ordering2", "pageNumbering");
			dispatch.on ("pageNumbering", setPageWidget);
			dispatch.on ("ordering2", setOrderButton);
			//console.log ("data", filteredData);
		}

		function dispatchWrapper (eventType, valueArray) {
			d3v3 ? dispatch[eventType].apply(this, valueArray) : dispatch.apply (eventType, this, valueArray);
		}

		function buildHeaders () {
			var columnEntries = d3.entries (my.columnSettings());
			
			var headerCells = my.getHeaderCells().data (columnEntries, function(d) { return d.key; });
			headerCells.exit().remove();
			var enterHeaderCells = headerCells.enter().append("th");
			
			// add elements to first header row
			var headerSpans = enterHeaderCells.append("span").attr("class", "d3table-headerSpan");
			
			headerSpans
				.append("svg").attr("class", "d3table-arrow")
				.on ("click", function (d) {
					my.orderKey(d.key).sort();
					dispatchWrapper ("ordering2", [d.key]);
					my.update();
				})
				.append ("svg:path")
					.attr ("d", "M7.5 4 L 13.5 10 L 1.5 10 Z")
			;
			headerSpans.append("span");

			if (!d3v3) { headerCells = enterHeaderCells.merge (headerCells); }

			// update first header row
			headerCells.each (function (d) {
				d3.select(this).select("span span")
					.text (d.value.columnName)
					.attr ("title", d.value.headerTooltip)
				;
			});
			
			// add elements to second header row
			var filterCells = my.getFilterCells().data (columnEntries, function(d) { return d.key; });
			filterCells.exit().remove();
			var enterFilterCells = filterCells.enter()
				.append("th")
			;
			enterFilterCells
				.append("div").attr("class", "d3table-flex-header")
				.append("input")
					.attr("class", "d3table-filterInput")
					.attr("type", "text")
					//.property("value", function(d) { return filter[d.value.id]; })
					.on ("input", function (d) {
						var filter = my.filter();
						filter[d.key] = d3.select(this).property("value");
						my.filter(filter).update();
					})
			;

			if (!d3v3) { filterCells = enterFilterCells.merge (filterCells); }

			// update second header row
		}

		function hideFilters () {
			var passTypes = d3.set(d3.keys(filterByTypeFuncs));
			my.getFilterCells().selectAll("div")
				.style ("display", function (d) { return passTypes.has (d.value.type) ? null : "none"; })
			;
		}
		
		function hideOrderWidgets () {
			my.getOrderWidgets().style ("display", function (d) { return comparators[d.value.type] ? null : "none"; });
		}

		function doPageCount () {
			pageCount = Math.max (1, Math.ceil ((filteredData ? filteredData.length : 0) / my.pageSize()));
			return pageCount;
		}

		// helper function for next bit
		function displayColumn (columnIndex, show) {
			selection.selectAll("td:nth-child("+columnIndex+"), th:nth-child("+columnIndex+")").style("display", show ? null : "none");
		}

		function hideColumns () {
			// hide columns that are hidden by default
			d3.entries(my.columnSettings()).forEach (function (d, i) {
				if (!d.value.visible) {
					displayColumn (i + 1, false);
				}
			});
		}
		
		my.getSelection = function () {
			return selection;
		};

		my.update = function () {
			var pageData = filteredData.slice ((page - 1) * pageSize, page * pageSize);
			var ko = my.columnOrder();
			var columnSettings = my.columnSettings();

			selection.selectAll(".d3table-pageTotal").text(pageCount);

			var rows = selection.select("tbody").selectAll("tr").data(pageData);

			if (this.preExit()) {
				this.preExit()(rows.exit());
			}
			rows.exit().remove();

			var enterRows = rows.enter().append("tr");

			if (!d3v3) { rows = enterRows.merge(rows); }

			var cells = rows.selectAll("td").data (function (d) { return ko.map (function (k) { return {key: k, value: d}; }); });
			var enterCells = cells.enter().append("td");

			if (!d3v3) { cells = enterCells.merge(cells); }

			cells
				.html (function(d) { var m = columnSettings[d.key].dataToHTMLModifier; return m ? m(d.value) : d.value[d.key]; })
				.attr ("class", function(d) { return columnSettings[d.key].cellStyle; })
			;

			cells
				.filter (function(d) { return columnSettings[d.key].tooltip; })
				.attr ("title", function(d) {
					var v = columnSettings[d.key].tooltip (d);
					return v ? v : "";
				})
			;	

			cells
				.filter (function (d) { return columnSettings[d.key].cellD3EventHook; })
				.each (function(d) { columnSettings[d.key].cellD3EventHook (d3.select(this)); })
			;

			hideColumns();

			if (this.postUpdate()) {
				this.postUpdate()(rows);
			}
		};

		my.typeSettings = function (type, settings) {
			if (!settings) { 
				return { 
					preprocessFunc: preprocessFilterInputFuncs[type],
					filterFunc: filterByTypeFuncs[type],
					comparator: comparators[type],
				};
			}

			preprocessFilterInputFuncs[type] = settings.preprocessFunc;
			filterByTypeFuncs[type] = settings.filterFunc;
			comparators[type] = settings.comparator;

			hideFilters();
			hideOrderWidgets();

			return my;
		},

		my.filter = function (value) {
			if (!arguments.length) { return filter; }
			filter = value;
			var ko = my.columnOrder();

			// Parse individual filters by type
			var processedFilterInputs = [];
			var accessorArray = [];
			var indexedFilterByTypeFuncs = [];
			ko.forEach (function (key) {
				var preProcessOutput;
				var filterVal = filter[key];
				var filterTypeFunc = null;
				if (filterHasContent (filterVal)) {
					var columnType = my.getColumnType(key);
					var preprocess = preprocessFilterInputFuncs[columnType];
					preProcessOutput = preprocess ? preprocess.call (this, filterVal) : filterVal;
					filterTypeFunc = filterByTypeFuncs[my.getColumnType(key)];
				} 
				accessorArray.push (my.columnSettings()[key].accessor);	// accessors allow accessing of deeper, nested data
				processedFilterInputs.push (preProcessOutput);
				indexedFilterByTypeFuncs.push (filterTypeFunc);
			}, this);		

			filteredData = my.getData().filter (function (rowdata) {
				var pass = true;
				for (var n = 0; n < ko.length; n++) {
					var parsedFilterInput = processedFilterInputs[n];
					if (parsedFilterInput !== undefined) {
						var accessor = accessorArray[n];
						var key = ko[n];
						// If accessor, use it
						var datum = accessor ? accessor(rowdata) : rowdata[key];
						if (!indexedFilterByTypeFuncs[n].call (this, datum, parsedFilterInput)) {
							pass = false;
							break;
						}
					}
				}
				return pass;
			}, this);

			this.sort();

			my.page(1);

			// update filter inputs with new filters
			var filterCells = this.getFilterCells();
			filterCells.select("input").property("value", function (d) {
				return filterHasContent(filter[d.key]) ? filter[d.key] : "";	
			});

			var filter2 = d3.entries(my.columnSettings()).map (function (columnSettingEntry) {
				return {value: (filterHasContent(columnSettingEntry.key) ? filter[columnSettingEntry.key] : null)};
			});
			dispatchWrapper ("filtering", [filter2]);

			return my;
		};

		my.refilter = function () {
			this.filter (this.filter());
			return my;
		};

		my.sort = function () {
			var orderKey = my.orderKey();
			var orderDir = my.orderDir();

			var orderType = my.getColumnType (orderKey);
			var comparator = orderKey && orderType ? comparators[orderType] : null;
			var accessor = orderKey ? my.columnSettings()[orderKey].accessor : null;

			if (orderDir !== "none" && comparator) {
				var mult = (orderDir === "asc" ? 1 : -1);
				var context = this;

				filteredData.sort (function (a, b) {
					var aval = accessor ? accessor(a) : a[orderKey];
					var bval = accessor ? accessor(b) : b[orderKey];
					var bnone = bval === undefined || bval === null;
					if (aval === undefined || aval === null) {
						return bnone ? 0 : -mult;
					}
					else {
						return bnone ? mult : mult * comparator.call (context, aval, bval);
					}
				});
			}

			return my;
		};

		my.orderKey = function (value) {
			if (!arguments.length) { return orderKey; }
			if (value !== orderKey) {
				orderKey = value;
				orderDir = "asc";
			} else {
				var index = orderDirs.indexOf(orderDir);
				orderDir = orderDirs[(index + 1) % orderDirs.length];
			}

			dispatchWrapper ("ordering", [my.getColumnIndex(orderKey), orderDir === "desc"]);
			dispatchWrapper ("ordering2", [orderKey]);

			return my;
		};

		my.orderDir = function (value) {
			if (!arguments.length) { return orderDir; }
			if (orderDirs.indexOf (orderDir) >= 0) {
				orderDir = value;
			}

			dispatchWrapper ("ordering", [my.getColumnIndex(orderKey), orderDir === "desc"]);
			dispatchWrapper ("ordering2", [orderKey]);

			return my;
		}

		my.page = function (value) {
			if (!arguments.length) { return page; }
			
			doPageCount();
			page = d3.median ([1, value, pageCount]);

			dispatchWrapper ("pageNumbering", [page]);

			return my;
		};

		my.pageSize = function (value) {
			if (!arguments.length) { return pageSize; }
			pageSize = value;
			doPageCount();
			return my;
		};

		/* What to do, if anything, to rows after update */
		my.postUpdate = function (value) {
			if (!arguments.length) { return postUpdate; }
			postUpdate = value;
			return my;
		};

		/* What to do if anything, to rows that are exiting (useful if they hold objects that need disposed nicely) */
		my.preExit = function (value) {
			if (!arguments.length) { return preExit; }
			preExit = value;
			return my;
		};

		my.getColumnIndex = function (key) {
			return my.columnOrder().indexOf(key);	
		};
		
		my.getColumnType = function (key) {
			var cSettings = my.columnSettings();
			return cSettings[key] ? cSettings[key].type : null;
		};
		
		my.showColumn = function (columnIndex, show) {
			displayColumn (columnIndex, show);
			return my;
		};

		my.getFilteredSize = function () {
			return filteredData.length;	
		};

		my.getData = function () {
			return selection.datum().data;
		};
		
		my.columnSettings = function (value) {
			if (!arguments.length) { return selection.datum().columnSettings; }
			selection.datum().columnSettings = value;
			return my;
		};
		
		my.columnOrder = function (value) {
			if (!arguments.length) { return selection.datum().columnOrder; }
			selection.datum().columnOrder = value;
			return my;
		};
		
		// For querying or changing the accessors / cellStyles / dataToHTMLModifiers
		my.metaDatum = function (field, columnKey, value) {
			var columnSettings = my.columnSettings();
			if (arguments.length === 2) { return columnSettings[columnKey][field]; }
			if (arguments.length === 3) {
				columnSettings[columnKey][field] = value;
			}
			return my;
		},

		my.getAllRowsSelection = function () {
			return selection.selectAll("tbody tr");
		};

		my.getHeaderCells = function () {
			return selection.select("thead tr:first-child").selectAll("th")
		};
		
		my.getOrderWidgets = function () {
			return this.getHeaderCells().selectAll("svg.d3table-arrow");
		};
		
		my.showOrderWidget = function (key, show) {
			this.getOrderWidgets()
				.filter (function (d) { return d.key === key; })
				.style ("display", show ? null : "none")
			;
			return my;
		};

		my.getFilterCells = function () {
			return selection.select("thead tr:nth-child(2)").selectAll("th");
		};

		my.showFilterCell = function (key, show) {
			this.getFilterCells().selectAll("div")
				.filter (function (d) { return d.key === key; })
				.style ("display", show ? null : "none")
			;
			return my;
		};

		// listen to this object to catch filter / sort events
		my.dispatch = function (value) {
			if (!arguments.length) { return dispatch; }
			dispatch = value;
			return my;
		};

		// store long calculations here that can be reused in filtering operations i.e. max / mins / averages
		my.cache = function (setting, value) {
			if (!value) { return cache[setting]; }
			cache[setting] = value;
			return my;
		}

		return my;
	};
	
	if (typeof define === "function" && define.amd) { this.d3Table = d3Table, define(d3Table); }
	else if (typeof module === "object" && module.exports) { 
		module.exports = {d3Table: d3Table}; 
		module.require = ['d3'];
	}
	else { this.CLMSUI = this.CLMSUI || {}; this.CLMSUI.d3Table = d3Table; }
}();
