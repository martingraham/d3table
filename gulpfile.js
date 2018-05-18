var gulp = require('gulp');
var concat = require('gulp-concat');
var rename = require('gulp-rename');
var uglify = require('gulp-uglify');
var cssmin = require('gulp-cssmin');
var clean = require('gulp-clean');
var print = require('gulp-print');
var mainNpmFiles = require('gulp-main-npm-files');
var npmFiles = require("gulp-npm-files");
var filter = require("gulp-filter");
var serial = require("run-sequence");
var bfy = require("gulp-browserify");

var outFolder = 'dist';
var outFolder2 = 'dist/vendor';
var nm = 'node_modules';


gulp.task('clean', function () {
    return gulp.src(outFolder, {read: false})
        .pipe(clean());
});

// Concat & Minify JS
gulp.task('minify', function() {
    return gulp.src([outFolder+'/js/*.js'])
        .pipe(concat('merged.js'))
        //.pipe(gulp.dest(outFolder+"/js"))	// keep intermediate, un-minified merged file
        .pipe(rename('d3table.min.js'))
        .pipe(uglify())
        .pipe(gulp.dest(outFolder+"/js"));
});

// Concat & Minify CSS
gulp.task('minifycss', function() {
    return gulp.src([outFolder+'/css/*.css'])
        .pipe(concat('merged.css'))
        .pipe(rename('d3table.min.css'))
        .pipe(cssmin())
        .pipe(gulp.dest(outFolder+"/css"));
});


gulp.task('copy', [], function() {
    return gulp.src (['*.html', './js/*', './css/*'], {base: '.'})
        .pipe (print())
        .pipe (gulp.dest(outFolder))
    ;
});

gulp.task('bfy', [], function() {
    return gulp.src (outFolder2+"/**/*.js", {base: '.'})
        .pipe (print())
        .pipe (bfy({
            //insertGlobals : true,
        }))
        .pipe (gulp.dest("."))
    ;
});

gulp.task ('copynpm', function () {
    var mainjs = mainNpmFiles();
    
    console.log (mainjs);
    
    var delim = '/';
    var rebasedMainjs = mainjs.map (function (js) {
        js = js.replace ("/./", "/");
        var split = js.split (delim);
        return "**" + delim + split.slice(2).join(delim);
    });
    
    var otherTypes = ['**/*.css', '!*/**/node_modules/**', '!**/docs/**', '!**/demos/**', '!**/tests/**'];
    var filterTo = rebasedMainjs.concat (otherTypes);
    console.log ("f", filterTo);
    
    return gulp.src (npmFiles(), { base: "./"+nm })
        .pipe (filter (filterTo))
        .pipe (print())
        .pipe (gulp.dest(outFolder2))
    ;
});


gulp.task ('all', ['clean'], function () {
    serial ('copy', 'copynpm');
});

// Default
gulp.task('default', ['all']);