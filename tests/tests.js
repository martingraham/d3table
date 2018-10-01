var has_require = typeof require !== 'undefined';
console.log ("has req", has_require);
if (has_require) {
	var m = require ("../demo/demoSetup.js");
	var CLMSUI = CLMSUI || {};
	CLMSUI.demoSetup = m.demoSetup;
}
console.log ("demoSetup", m || CLMSUI);

var table = CLMSUI.demoSetup();


QUnit.module ("Populated table");

QUnit.test("Page size", function (assert) {
	var expected = 20;
  assert.deepEqual(table.pageSize(), expected, "Expected page size "+JSON.stringify(expected)+", Passed!");
  assert.deepEqual(table.getAllRowsSelection().size(), expected, "Expected "+JSON.stringify(expected)+" rows in visible table, Passed!");
});

QUnit.test("Unfiltered data size", function (assert) {
	assert.deepEqual(table.getData().length, 20000, "Expected 20000 items in dataset, Passed!");
  assert.deepEqual(table.getData().length, table.getFilteredSize(), "Unfiltered dataset and filtered dataset same size with no filter set, Passed!");
});

QUnit.test("filtered single id and restore", function (assert) {
	var filter = table.filter();
	filter.id = "100";
	table.filter(filter);
  assert.deepEqual(table.getFilteredSize(), 1, "Expected 1 item in filtered data set, Passed!");
	
	table.update();
	var rowCount = table.getAllRowsSelection().size();
  	assert.deepEqual (rowCount, 1, "1 row in visible table, Passed!");
	
	filter = table.filter();
	filter.id = "";
	table.filter(filter);
  assert.deepEqual(table.getFilteredSize(), 20000, "Expected 20000 items in filtered data set on filter removal, Passed!");
	
	table.update();
	rowCount = table.getAllRowsSelection().size();
	assert.deepEqual(rowCount, 20, "20 rows in visible table, Passed!");
});

QUnit.test("filtered range id and restore", function (assert) {
	var filter = table.filter();
	filter.id = "100 199";
	table.filter(filter);
  assert.deepEqual(table.getFilteredSize(), 100, "Expected 100 items in filtered data set, Passed!");
	
	filter = table.filter();
	filter.id = "";
	table.filter(filter);
  assert.deepEqual(table.getFilteredSize(), 20000, "Expected 20000 items in filtered data set on filter removal, Passed!");
});

QUnit.test("set filter object", function (assert) {
	var expected = (20000/8);
	var filter = table.filter();
	filter.object = "cat";
	table.filter(filter);
  assert.deepEqual(table.getFilteredSize(), expected, "Expected "+expected+" items in filtered data set, Passed!");
	
	// restore table state
	filter = table.filter();
	filter.object = "";
	table.filter(filter);
});

QUnit.test("set filter array", function (assert) {
	var expected = (20000/5) + (20000/5) - (20000/25);
	var filter = table.filter();
	filter.array = "chorizo";
	table.filter(filter);
  assert.deepEqual(table.getFilteredSize(), expected, "Expected "+expected+" items in filtered data set, Passed!");
	
	// restore table state
	filter = table.filter();
	filter.array = "";
	table.filter(filter);
});

QUnit.test("set filter deep access range", function (assert) {
	var expected = ((100 - 20) / 2) + 1;	// 41
	var filter = table.filter();
	filter.deep = "20 100";
	table.filter(filter);
    assert.deepEqual(table.getFilteredSize(), expected, "Expected "+expected+" items in filtered data set, Passed!");
	
	// restore table state
	filter = table.filter();
	filter.deep = "";
	table.filter(filter);
});

QUnit.test("set filter deep access value to zero", function (assert) {
	var expected = 1;
	var filter = table.filter();
	filter.deep = 0;
	table.filter(filter);
    assert.deepEqual(table.getFilteredSize(), expected, "Expected "+expected+" items in filtered data set, Passed!");
	
	// restore table state
	filter = table.filter();
	filter.deep = "";
	table.filter(filter);
});

QUnit.test("set conjunctive filter array and object", function (assert) {
	var expected = ((20000/5) + (20000/5) - (20000/25)) / 8;
	var filter = table.filter();
	filter.array = "chorizo";
	filter.object = "cat";
	table.filter(filter);
  assert.deepEqual(table.getFilteredSize(), expected, "Expected "+expected+" items in filtered data set, Passed!");
	
	// restore table state
	filter = table.filter();
	filter.array = "";
	filter.object = "";
	table.filter(filter);
});

QUnit.test("sort by array", function (assert) {
	var expected = ["bratwurst", "bratwurst"];
	table.orderKey("array").orderDir("asc").sort().update();
	var firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	var firstRowData = firstRow.datum();
  	assert.deepEqual (firstRowData.array, expected, "Expected "+JSON.stringify(expected)+" first in table, Passed!");
	
	expected = ["lorne", "lorne"];
	table.orderDir("desc").sort().update();
	firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	firstRowData = firstRow.datum();
	assert.deepEqual (firstRowData.array, expected, "Expected "+JSON.stringify(expected)+" first in table, Passed!");
});

QUnit.test("sort by id", function (assert) {
	var expected = 1;
	table.orderKey("id").orderDir("asc").sort().update();
	var firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	var firstRowData = firstRow.datum();
  	assert.deepEqual (firstRowData.id, expected, "Expected id "+JSON.stringify(expected)+" first in table, Passed!");
	
	expected = 20000;
	table.orderDir("desc").sort().update();
	firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	firstRowData = firstRow.datum();
	assert.deepEqual (firstRowData.id, expected, "Expected id "+JSON.stringify(expected)+" first in table, Passed!");
});

QUnit.test("sort by id, then filter by array", function (assert) {
	var expected = 2;
	table.orderKey("id").orderDir("asc").sort();
	var filter = table.filter();
	filter.array = "chorizo";
	table.filter(filter);
	table.update();
	var firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	var firstRowData = firstRow.datum();
  	assert.deepEqual (firstRowData.id, expected, "Expected id "+JSON.stringify(expected)+" first in table, Passed!");
	
	expected = 19997;
	table.orderDir("desc").sort().update();
	firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	firstRowData = firstRow.datum();
	assert.deepEqual (firstRowData.id, expected, "Expected id "+JSON.stringify(expected)+" first in table, Passed!");
	
	// restore table state
	filter = table.filter();
	filter.array = "";
	table.filter(filter);
});

QUnit.test("filter by array, then sort by id", function (assert) {
	var expected = 2;
	var filter = table.filter();
	filter.array = "chorizo";
	table.filter(filter);
	table.orderKey("id").orderDir("asc").sort().update();
	var firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	var firstRowData = firstRow.datum();
  	assert.deepEqual (firstRowData.id, expected, "Expected id "+JSON.stringify(expected)+" first in table, Passed!");
	
	expected = 19997;
	table.orderDir("desc").sort().update();
	firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	firstRowData = firstRow.datum();
	assert.deepEqual (firstRowData.id, expected, "Expected id "+JSON.stringify(expected)+" first in table, Passed!");
	
	// restore table state
	filter = table.filter();
	filter.array = "";
	table.filter(filter).orderDir("asc").sort().update();
});

QUnit.test("page to 20", function (assert) {
	var expected = 401;
	table.page(21).update();
	var firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	var firstRowData = firstRow.datum();
  	assert.deepEqual (firstRowData.id, expected, "Expected id "+JSON.stringify(expected)+" first in table, Passed!");
});


QUnit.test("Hide columns", function (assert) {
	//assert.expect (1);
	var done = assert.async(2);
	
	var expectedColumns = 2;
	table.showColumnByKey("id", false).showColumnByKey("array", false).update();
	
	setTimeout(function() {
		var hiddenColumns = table.getHeaderCells().filter(function() { return d3.select(this).style("display") === "none"; });
  		assert.deepEqual (hiddenColumns.size(), expectedColumns, "Expected "+JSON.stringify(expectedColumns)+" hidden columns in table, Passed!");
		done();
	});
	
	setTimeout(function() {
		table.showColumnByKey("id", true).showColumnByKey("array", true).update();
		done();
	});
	
});


QUnit.module ("Empty table");

QUnit.test("empty table", function (assert) {
	var expected = 0;
	var emptyTable = CLMSUI.demoSetup([], "putSecondd3TableHere");
	var tableSize = emptyTable.getAllRowsSelection().size();
  	assert.deepEqual (tableSize, expected, "Expected empty table size is "+JSON.stringify(expected)+", Passed!");
});

//console.log ("table", table);

