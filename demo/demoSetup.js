var has_require = typeof require !== 'undefined';
if (has_require) {
	var CLMSUI = CLMSUI || {};
	var m = require ("../js/d3table.js");
	CLMSUI.d3Table = m.d3Table;
	console.log ("d3 module", m, CLMSUI);
}

!function () {
	function demoSetup (useThisData, useThisTableContainerID) {
		function makeString () {
			return Math.random().toString(36).slice(2);
		};
		var animals = ["ant", "bat", "cat", "dog", "eel", "fox", "gnu", "hen"];
		var sausages = ["cumberland", "chorizo", "lincoln", "lorne", "bratwurst"];

		var tableContainerID = useThisTableContainerID || "putd3TableHere";
		
		// data is array of objects
		var data = useThisData || d3.range(0,20000).map (function (d, i) {
			return {
				id: i+1, 
				"number": i+1, 
				"string": makeString(), 
				"boolean": Math.random() > 0.5,
				"object": { animal: animals[i % 8], count: i % 64 },
				"array": [sausages[i % 5], sausages[Math.floor((i % 25) / 5)]],
				"deep": {deepData: i*2},
			}
		});

		// headers is an array of key/value objects, keys should match property names in data to populate cells
		// If using a key that's not in the data the column's cells will be empty, but you can put buttons and stuff in later

		// value settings can decide whether field is initially visible, and/or removable, simple tooltip, and a header label (name)
		// correct type is also important for filtering and sorting
		var columnSettings = [
			{key: "id", value: {columnName: "id", visible: true, removable: true, type: "numeric"}},
			{key: "number", value: {columnName: "a number", visible: true, removable: true, type: "numeric"}},
			{key: "string", value: {columnName: "a string", visible: true, removable: true, type: "alpha"}},
			{key: "boolean", value: {columnName: "a boolean", visible: true, removable: true, type: "boolean", tooltip: "A Boolean Column"}},
			{key: "object", value: {columnName: "an object", visible: true, removable: true, type: "myObject", tooltip: "An Object Column"}},
			{key: "array", value: {columnName: "an array", visible: true, removable: true, type: "alphaArray", tooltip: "An Array Column"}},
			{key: "deep", value: {columnName: "deep access", visible: true, removable: true, type: "numeric", tooltip: "A Deep Access Column", accessor: function (d) { return d.deep.deepData; }}},
			{key: "button", value: {columnName: "a button", visible: true, removable: true, type: "none", tooltip: "A Button Column"}},
		];

		// Comparator (for sort) and filter functions for a bespoke complex object - alpha, numeric and boolean are built-in
		var myObjectTypeSettings = {
			preprocessFunc: function (filterVal) {
				return filterVal;	
			},
			filterFunc: function (datum, processedFilterVal) {
				return datum.count === +processedFilterVal || datum.animal === processedFilterVal;
			},
			comparator: function (a, b) {
				var z = a.count - b.count;
				if (z !== 0) return z;
				return a.animal.localeCompare (b.animal);
			}	
		};

		var alphaArrayTypeSettings = {
			preprocessFunc: function (filterVal) {
				return this.typeSettings("alpha").preprocessFunc (filterVal);
			},
			filterFunc: function (datum, processedFilterVal) {
				var basicFilterFunc = this.typeSettings("alpha").filterFunc;
				var pass = false;
				if (Array.isArray(datum)) {
					// just need 1 element in array to not be filtered out to pass
					for (var m = 0; m < datum.length; m++) {
						if (basicFilterFunc (datum[m], processedFilterVal)) {
							pass = true;
							break;
						}
					}
				} else {
					pass = basicFilterFunc (datum, processedFilterVal);
				}
				return pass;
			},
			comparator: function (a, b) {
				var comparator = this.typeSettings("alpha").comparator;
				var minlen = Math.min (a.length, b.length);
				for (var n = 0; n < minlen; n++) {
					var diff = comparator (a[n], b[n]);
					if (diff !== 0) {
						return diff;
					}
				}

				var z = a.length - b.length;
				return z;
			}
		}

		// style classes can be applied to cells for certain data
		var cellStyles = {
			number: "rightAlign",
			object: "colourfulNumbers",
		};

		// modify contents of table cells if you want something other than just raw data values (like buttons, or elements you want styles to apply to etc)
		var modifiers = {
			id: function (d) { return "ID "+d.id; },	// here in modifiers, d is just object of values indexed by field
			number: function (d) { return d3.format(",")(d.number); },
			object: function (d) { return "<span class='count'>"+d.object.animal+"</span>"; },
			array: function (d) { return d.array.join(", "); },
			deep: function (d) { return d.deep.deepData; },
			button: function (d) { return "<button>Press Me "+d.id+"</button>"; },
		};

		// attr.title based simple tooltips
		var simpleTooltips = {
			string: function(d) { return d.value.string+" was randomly generated"; },
			id: function(d) { return d3.values(d.value).join(", "); },
		};

		// d3 hooks can be added to elements in table cells once they've been set up, can do posher tooltips, event handling, complex styling etc
		var cellD3Hooks = {
			string: function (cellSel) {
				cellSel
				.on ("mouseover", function (d) {
					d3.select("h1").text(d.value[d.key])	// here in cellEvent Hooks, d.key = field, d.values  = all field values for row that cell is in
				})
				.on ("mouseout", function () {
					d3.select("h1").text("D3 Table")	
				})
				;
			},
			object: function (cellSel) {
				cellSel.select(".count").style("width", function(d) { return (d.value.object.count * 10)+"px"; });
			},
			button: function (cellSel) {
				cellSel.select("button").on("click", function (d) { alert ("clicked button for "+d.value.id); })
			}
		};


		// initial filters
		var keyedFilters = {};
		columnSettings.forEach (function (hentry) {
			keyedFilters[hentry.key] = "";
		});


		// stuff to do to entire rows not just cells, after update has happened
		var highlightRows = function (rowSelection) {
			rowSelection.classed ("highlightHens", function (d) { return d.object.animal === "hen"; })
		};

		// stuff to do to entire rows that are exiting (usually clean up anything in there that needs it)
		var exitingRows = function (rowSelection) {};


		var holder = d3.select("#"+tableContainerID);
		if (holder.empty()) {
			d3.select("body").append("div").attr("id", tableContainerID);
		}
		var d3tab = d3.select("#"+tableContainerID).attr("class", "d3tableContainer")
			.datum({
				data: data, 
				columnSettings: columnSettings, 
				cellStyles: cellStyles,
				cellD3Hooks: cellD3Hooks,
				tooltips: simpleTooltips,
				columnOrder: columnSettings.map (function (hentry) { return hentry.key; }), // columnOrder same as columnSettings declaration order
			})
		;
		var table = CLMSUI.d3Table ();
		table (d3tab);	


		table
			.typeSettings ("myObject", myObjectTypeSettings)
			.typeSettings ("alphaArray", alphaArrayTypeSettings)
			.filter (keyedFilters)
			.dataToHTML (modifiers)
			.preExit (exitingRows)
			.postUpdate (highlightRows)
			.pageSize(20)
			.update()
		;

		return table;
	}
	
	if (typeof define === "function" && define.amd) { this.demoSetup = demoSetup, define(demoSetup); }
	else if (typeof module === "object" && module.exports) { 
		module.exports = {demoSetup: demoSetup}; 
		module.require = ['d3Table'];
	}
	else { this.CLMSUI = this.CLMSUI || {}; this.CLMSUI.demoSetup = demoSetup; }
}();