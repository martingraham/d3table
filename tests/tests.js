QUnit.test( "hello test", function( assert ) {
  assert.ok( 1 == "1", "Passed!" );
});

var table = demoSetup();

QUnit.test("page size", function (assert) {
  assert.deepEqual(table.pageSize(), 20, "Passed!" );
  assert.deepEqual(table.getAllRowsSelection().size(), 20, "Passed!" );
});

QUnit.test("data size", function (assert) {
	assert.deepEqual(table.getData().length, 20000, "Passed!" );
  assert.deepEqual(table.getData().length, table.getFilteredSize(), "Passed!" );
});

QUnit.test("filtered single id", function (assert) {
	var filter = table.filter();
	filter.id.value = "100";
	table.filter(filter);
  assert.deepEqual(table.getFilteredSize(), 1, "Passed!" );
});

QUnit.test("filtered range id", function (assert) {
	var filter = table.filter();
	filter.id.value = "100 199";
	table.filter(filter);
  assert.deepEqual(table.getFilteredSize(), 100, "Passed!" );
});

QUnit.test("remove filter id", function (assert) {
	var filter = table.filter();
	filter.id.value = "";
	table.filter(filter);
  assert.deepEqual(table.getFilteredSize(), 20000, "Passed!" );
});

QUnit.test("set filter object", function (assert) {
	var filter = table.filter();
	filter.object.value = "cat";
	table.filter(filter);
  assert.deepEqual(table.getFilteredSize(), 20000/8, "Passed!" );
	var filter = table.filter();
	filter.object.value = "";
	table.filter(filter);
});

QUnit.test("set filter array", function (assert) {
	var filter = table.filter();
	filter.array.value = "chorizo";
	table.filter(filter);
  assert.deepEqual(table.getFilteredSize(), (20000/5) + (20000/5) - (20000/25), "Passed!" );
	var filter = table.filter();
	filter.id.value = "";
	table.filter(filter);
});

QUnit.test("set conjunctive filter array and object", function (assert) {
	var filter = table.filter();
	filter.array.value = "chorizo";
	filter.object.value = "cat";
	table.filter(filter);
  assert.deepEqual(table.getFilteredSize(), ((20000/5) + (20000/5) - (20000/25)) / 8, "Passed!" );
	var filter = table.filter();
	filter.array.value = "";
	filter.object.value = "";
	table.filter(filter);
});

QUnit.test("sort by array", function (assert) {
	table.orderKey("array").orderDir("asc").sort().update();
	var firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	var firstRowData = firstRow.datum();
  	assert.deepEqual (firstRowData.array, ["bratwurst", "bratwurst"], "Passed!" );
	
	table.orderDir("desc").sort().update();
	var firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	var firstRowData = firstRow.datum();
	assert.deepEqual (firstRowData.array, ["lorne", "lorne"], "Passed!" );
});

QUnit.test("sort by id", function (assert) {
	table.orderKey("id").orderDir("asc").sort().update();
	var firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	var firstRowData = firstRow.datum();
  	assert.deepEqual (firstRowData.id, 1, "Passed!" );
	
	table.orderDir("desc").sort().update();
	var firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	var firstRowData = firstRow.datum();
	assert.deepEqual (firstRowData.id, 20000, "Passed!" );
});

QUnit.test("sort by id, then filter by array", function (assert) {
	table.orderKey("id").orderDir("asc").sort();
	var filter = table.filter();
	filter.array.value = "chorizo";
	table.filter(filter);
	table.update();
	var firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	var firstRowData = firstRow.datum();
  	assert.deepEqual (firstRowData.id, 2, "Passed!" );
	
	table.orderDir("desc").sort().update();
	var firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	var firstRowData = firstRow.datum();
	assert.deepEqual (firstRowData.id, 19997, "Passed!" );
	
	var filter = table.filter();
	filter.array.value = "";
	table.filter(filter);
});

QUnit.test("filter by array, then sort by id", function (assert) {
	var filter = table.filter();
	filter.array.value = "chorizo";
	table.filter(filter);
	table.orderKey("id").orderDir("asc").sort().update();
	var firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	var firstRowData = firstRow.datum();
  	assert.deepEqual (firstRowData.id, 2, "Passed!" );
	
	table.orderDir("desc").sort().update();
	var firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	var firstRowData = firstRow.datum();
	assert.deepEqual (firstRowData.id, 19997, "Passed!" );
	
	var filter = table.filter();
	filter.array.value = "";
	table.filter(filter).orderDir("asc");
});

QUnit.test("page to 20", function (assert) {
	table.page(21).update();
	var firstRow = table.getAllRowsSelection().filter(function(d,i) { return i === 0; });
	var firstRowData = firstRow.datum();
  	assert.deepEqual (firstRowData.id, 401, "Passed!" );
});

