/*jslint browser: true, white: true, stupid: true, vars: true*/
var has_require = typeof require !== 'undefined';
if (has_require) {
    d3 = require ("../vendor/js/d3.js");
}

/**
 * D3Table
 * @version 1.0
 * @namespace d3Table
 */
!function() {

    /**
     *  D3Table wrapper function - no arguments
     *  Tries to follow Mike Bostock's reusable chart convention - https://bost.ocks.org/mike/chart/
     *  @class d3Table
     */
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
        var dispatch = d3.dispatch ("columnHiding", "filtering", "ordering", "ordering2", "pageNumbering");

        var d3v3 = d3.version[0] === "3";

        /**
        *  Helper function - Zero is a valid value for a filter
        *  @function
        *  @memberOf d3Table
        *  @param filter - a filter value
        *  @returns {boolean} return false if undefined, null or empty string - true otherwise
        */
        function filterHasContent (filter) {
            return filter || (filter === 0);
        }

        var escapeRegex = /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g;    // https://stackoverflow.com/a/3561711

        var preprocessFilterInputFuncs = {
            alpha: function (filterVal) {
                // Strings split by spaces and entries must later match all substrings: As asked for by lutz and worked in the old table - issue 139
                var parts = filterVal ? filterVal.split(" ").map (function (part) {
                    return part.replace (escapeRegex, '\\$&');
                }) : [];
                if (parts.length > 1) {
                    parts = parts.map (function (part) { return "(?=.*"+part+")"; });
                }
                return new RegExp (parts.join(""), "i");
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

        /**
        *  Helper function - returns true or false depending on input, including strings like "t", "true", and "1"
        *  @function
        *  @memberOf d3Table
        *  @param val - value to test for truthyness
        *  @param nullIsFalse - return false for null value if this parameter set to true
        *  @returns {boolean}
        */
        function toBoolean (val, nullIsFalse) {
            return (val === "1" || val === "t" || val === "true" || val === true) ? true : ((val === "0" || val === "f" || val === "false" || val === false || (val === null && nullIsFalse)) ? false : null);
        }

        /**
        *  Main Table Configuration function
        *  @function
        *  @memberOf d3Table
        *  @param mySelection - an initial d3 selection (dom element with attached data)
        */
        function my (mySelection) {	// data in selection should be 2d-array [[]] or single empty array [] for empty tables
            selection = mySelection;
            filteredData = my.getData();

            selection.classed ("d3tableContainer", true);

            if (selection.select("table").empty()) {

                function addPageWidget (elem, childNodeType) {
                    //console.log ("elem", elem, "this", this, "args", arguments);
                    elem.attr("class", "d3tableControls d3table-pagerInfo");
                    var pageInfo = elem.append(childNodeType || "span").attr("class", "d3table-pageInfo");

                    pageInfo.append("span")
                        .attr("class", "d3table-pageInput")
                        .append ("input")
                            .attr ("class", "d3table-pageWidget")
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
                table.append("thead").selectAll("tr").data(["","d3table-filterRow"]).enter().append("tr").attr("class", function(d) { return d; });
                table.append("tbody");
                table.append("caption").call(addPageWidget, "span");	// add bottom page control
            }

            buildHeaders ();
            hideFilters ();
            hideOrderWidgets ();

            doPageCount();

            function setPageWidget (page) {
                selection.selectAll(".d3table-pageInput input.d3table-pageWidget").property ("value", page);
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

            dispatch.on ("pageNumbering.internal", setPageWidget);
            dispatch.on ("ordering2.internal", setOrderButton);
            //console.log ("data", filteredData);
        }

        /**
        *  d3 dispatch wrapper to handle d3 v3 and v5
        *  @function
        *  @memberOf d3Table
        *  @param eventType - dispatch event
        *  @param valueArray - values to dispatch
        */
        function dispatchWrapper (eventType, valueArray) {
            d3v3 ? dispatch[eventType].apply(this, valueArray) : dispatch.apply (eventType, this, valueArray);
        }


        /**
        *  Build HTML Table headers from data and column settings.
        *  First row is column names with sorting buttons.
        *  Second row is filtering inputs if applicable for column
        *  @function
        *  @memberOf d3Table
        */
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

        /**
        *  Hide header row filter widgets from view for non-filterable columns
        *  @function
        *  @memberOf d3Table
        */
        function hideFilters () {
            var passTypes = d3.set(d3.keys(filterByTypeFuncs));
            my.getFilterCells().selectAll("div")
                .style ("display", function (d) { return passTypes.has (d.value.type) ? null : "none"; })
            ;
        }

        /**
        *  Hide header row ordering widgets from view for non-orderable columns
        *  @function
        *  @memberOf d3Table
        */
        function hideOrderWidgets () {
            my.getOrderWidgets().style ("display", function (d) { return comparators[d.value.type] ? null : "none"; });
        }


        /**
        *  Count the number of possible pages given a single page size and the current filtered size of the data set
        *  @function
        *  @memberOf d3Table
        *  @returns {number} number of pages
        */
        function doPageCount () {
            pageCount = Math.max (1, Math.ceil ((filteredData ? filteredData.length : 0) / my.pageSize()));
            return pageCount;
        }

        /**
        *  Show or hide given column in table by index
        *  @function
        *  @memberOf d3Table
        *  @param columnIndex - one-indexed column to act on
        *  @param show {boolean} - hide (false) or show (true) column
        */
        function displayColumn (columnIndex, show) {
            selection.selectAll("td:nth-child("+columnIndex+"), th:nth-child("+columnIndex+")").style("display", show ? null : "none");
        }

        /**
        *  Hide/show columns using current column settings data
        *  @function
        *  @memberOf d3Table
        */
        function hideColumns () {
            // hide columns that are hidden by default
            var csettings = my.columnSettings();
            my.columnOrder().forEach (function (key, i) {
                if (csettings[key]) {
                    // OMG OMG. I used 'select' here instead of 'selectAll' and it passed on the whole table datum to every td cell in the last row
                    // That's what it's meant to do in fairness, but it's an insidious side-effect when you're just wanting to access an element
                    var lastRowCellSelect = selection.selectAll("tbody tr:last-child td:nth-child("+(i+1)+")");
                    if (!lastRowCellSelect.empty()) {
                        var currentState = lastRowCellSelect.style("display") !== "none";
                        var proposedState = csettings[key].visible;
                        if (currentState !== proposedState) {
                            displayColumn (i + 1, proposedState);
                        }
                    }
                }
            })
        }


        /**
        *  Get the current d3 selection on this d3table
        *  @function
        *  @memberOf d3Table
        *  @returns a d3Selection
        */
        my.getSelection = function () {
            return selection;
        };

        /**
        *  Update this d3table to reflect current sorting, filtering and column settings
        *  @function
        *  @memberOf d3Table
        */
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

            var cells = rows.selectAll("td").data (function (d, i) { return ko.map (function (k) { return {key: k, value: d}; }); });
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

        /**
        *  Get or set object type preprocessing, filtering and comparator functions.
        *  There are defaults for boolean, numbers and strings - this is used for more complex objects.
        *  @function
        *  @memberOf d3Table
        *  @param type - object type name
        *  @param settings - the functions to set, wrapped in an object with named properties{preprocessFunc, filterFunc, and comparator.
        *  @returns the object type functions if params is empty, or the d3table object if setting values
        */
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

        /**
        *  Get or set filter values for the table.
        *  If setting values, run them on the table data to update the filteredData object.
        *  Will also update filter header cells.
        *  @function
        *  @memberOf d3Table
        *  @param value - object with column names as keys, filter values as values
        *  @returns the current filters if params is empty, or the d3table object if setting values
        */
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

        /**
        *  Rerun current filter, useful if data has changed
        *  @function
        *  @memberOf d3Table
        *  @returns the d3table object
        */
        my.refilter = function () {
            this.filter (this.filter());
            return my;
        };

        /**
        *  Sort filtered data according to current sort key and order (desc/asc)
        *  @function
        *  @memberOf d3Table
        *  @returns the d3table object
        */
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

        /**
        *  Get or set ordering key (column name) for d3table
        *  @function
        *  @memberOf d3Table
        *  @param value - column name to sort in
        *  @returns the current orderKey if value is empty, or the d3table object if setting a value
        */
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

        /**
        *  Get or set ordering direction ("asc" or "desc) for d3table
        *  @function
        *  @memberOf d3Table
        *  @param value - direction to sort in
        *  @returns the current order direction if value is empty, or the d3table object if setting a value
        */
        my.orderDir = function (value) {
            if (!arguments.length) { return orderDir; }
            if (orderDirs.indexOf (orderDir) >= 0) {
                orderDir = value;
            }

            dispatchWrapper ("ordering", [my.getColumnIndex(orderKey), orderDir === "desc"]);
            dispatchWrapper ("ordering2", [orderKey]);

            return my;
        }

        /**
        *  Get or set the page number for d3table
        *  @function
        *  @memberOf d3Table
        *  @param value - page number to set
        *  @returns the current page number if value is empty, or the d3table object if setting a value
        */
        my.page = function (value) {
            if (!arguments.length) { return page; }

            doPageCount();
            page = d3.median ([1, value, pageCount]);

            dispatchWrapper ("pageNumbering", [page]);

            return my;
        };

        /**
        *  Get or set the page size for d3table
        *  @function
        *  @memberOf d3Table
        *  @param value - page size to set
        *  @returns the current page size if value is empty, or the d3table object if setting a value
        */
        my.pageSize = function (value) {
            if (!arguments.length) { return pageSize; }
            pageSize = value;
            doPageCount();
            return my;
        };

        /**
        *  Get or set a function to perform on rows after update - can be null
        *  @function
        *  @memberOf d3Table
        *  @param value - function to run post update
        *  @returns the current function if value is empty, or the d3table object if setting a value
        */
        my.postUpdate = function (value) {
            if (!arguments.length) { return postUpdate; }
            postUpdate = value;
            return my;
        };

        /**
        *  Get or set a function to perform on rows that are exiting (useful if they hold objects that need disposed nicely)
        *  @function
        *  @memberOf d3Table
        *  @param value - function to run pre exit rows
        *  @returns the current function if value is empty, or the d3table object if setting a value
        */
        my.preExit = function (value) {
            if (!arguments.length) { return preExit; }
            preExit = value;
            return my;
        };

        /**
        *  Get column index of column name
        *  @function
        *  @memberOf d3Table
        *  @param key - column key (generally name)
        *  @returns {number} index of column
        */
        my.getColumnIndex = function (key) {
            return my.columnOrder().indexOf(key);
        };

        /**
        *  Get column datatype
        *  @function
        *  @memberOf d3Table
        *  @param key - column key (generally name)
        *  @returns column type
        */
        my.getColumnType = function (key) {
            var cSettings = my.columnSettings();
            return cSettings[key] ? cSettings[key].type : null;
        };

        /**
        *  Hide or show individual column
        *  @function
        *  @memberOf d3Table
        *  @param columnIndex - index of column
        *  @param show - true to show, false to hide
        *  @returns d3table object
        */
        my.showColumn = function (columnIndex, show) {
            displayColumn (columnIndex, show);
            return my;
        };

        /**
        *  Hide or show individual column by key
        *  @function
        *  @memberOf d3Table
        *  @param key - column key
        *  @param show - true to show, false to hide
        *  @returns visibility of column as boolean if only key passed in, otherwise d3table object
        */
        my.showColumnByKey = function (key, show) {
            if (!arguments.length) { return undefined; }
            if (arguments.length === 1) { return this.columnSettings()[key].visible; }
            this.columnSettings()[key].visible = show;
            return my;
        };

        /**
        *  Get size of filtered data set
        *  @function
        *  @memberOf d3Table
        *  @returns {number} filtered data set size
        */
        my.getFilteredSize = function () {
            return filteredData.length;
        };

        /**
        *  Get filtered data set
        *  @function
        *  @memberOf d3Table
        *  @returns filtered data set
        */
        my.getFilteredData = function () {
            return filteredData.slice();
        },

        /**
        *  Get original data set
        *  @function
        *  @memberOf d3Table
        *  @returns original data set
        */
        my.getData = function () {
            return selection.datum().data;
        };

        /**
        *  Get or set column settings as a whole (all columns)
        *  For individual columns these can include:
        *  1. dataToHTMLModifier - function to decorate or transform raw data in appearance.
        *  2. tooltip - function to decide tooltip information.
        *  3. cellStyle - css class to add to table cells for this column
        *  4. accessor - function to drill down into complex object and return data, used in filtering operations
        *  5. cellD3EventHook - mouse listener for cells in column - usually  when transforming data to button objects etc
        *  6. type - the datatype of the column
        *  @function
        *  @memberOf d3Table
        *  @param value - column settings object
        *  @returns the current column settings if value is empty, or the d3table object if setting a value
        */
        my.columnSettings = function (value) {
            if (!arguments.length) { return selection.datum().columnSettings; }
            selection.datum().columnSettings = value;
            return my;
        };

        /**
        *  Get or set column order as a whole (all columns)
        *  @function
        *  @memberOf d3Table
        *  @param value - column order object
        *  @returns the current order settings if value is empty, or the d3table object if setting a value
        */
        my.columnOrder = function (value) {
            if (!arguments.length) { return selection.datum().columnOrder; }
            selection.datum().columnOrder = value;
            return my;
        };

        /**
        *  Get or set individual parts of the column settings object for a column e.g. accessors / cellStyles / dataToHTMLModifiers
        *  @function
        *  @memberOf d3Table
        *  @param field - field in column settings object for a column
        *  @param columnKey - column key
        *  @param value - new value to set (usually a function)
        *  @returns the current column settings for a field/column combination if value is empty, or the d3table object if setting a value
        */
        my.metaDatum = function (field, columnKey, value) {
            var columnSettings = my.columnSettings();
            if (arguments.length === 2) { return columnSettings[columnKey][field]; }
            if (arguments.length === 3) {
                columnSettings[columnKey][field] = value;
            }
            return my;
        },

        /**
        *  Get current HTML table rows as d3 selection
        *  @function
        *  @memberOf d3Table
        *  @returns d3 selection
        */
        my.getAllRowsSelection = function () {
            return selection.selectAll("tbody tr");
        };

        /**
        *  Get current HTML first header row cells as d3 selection
        *  @function
        *  @memberOf d3Table
        *  @returns d3 selection
        */
        my.getHeaderCells = function () {
            return selection.select("thead tr:first-child").selectAll("th")
        };

        /**
        *  Get current HTML first header row ordering widgets as d3 selection
        *  @function
        *  @memberOf d3Table
        *  @returns d3 selection
        */
        my.getOrderWidgets = function () {
            return this.getHeaderCells().selectAll("svg.d3table-arrow");
        };

        /**
        *  Show or hide order widget for a given column
        *  @function
        *  @memberOf d3Table
        *  @param key - column key (name)
        *  @param show - true to show, false to hide
        *  @returns d3table object
        */
        my.showOrderWidget = function (key, show) {
            this.getOrderWidgets()
                .filter (function (d) { return d.key === key; })
                .style ("display", show ? null : "none")
            ;
            return my;
        };

        /**
        *  Get current HTML header filter cells as d3 selection
        *  @function
        *  @memberOf d3Table
        *  @returns d3 selection
        */
        my.getFilterCells = function () {
            return selection.select("thead tr.d3table-filterRow").selectAll("th");
        };

        /**
        *  Show or hide filter cell for a given column
        *  @function
        *  @memberOf d3Table
        *  @param key - column key (name)
        *  @param show - true to show, false to hide
        *  @returns d3table object
        */
        my.showFilterCell = function (key, show) {
            this.getFilterCells().selectAll("div")
                .filter (function (d) { return d.key === key; })
                .style ("display", show ? null : "none")
            ;
            return my;
        };

        // listen to this object to catch filter / sort events
        /**
        *  Get or set d3 dispatch object used to listen to filtering / ordering operations
        *  @function
        *  @memberOf d3Table
        *  @param value - new dispatch object
        *  @returns current dispatch object if no value passed, otherwise d3table object
        */
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
