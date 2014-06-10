var gulp = require('gulp');
var minifycss = require('gulp-minify-css');
var jshint = require('gulp-jshint');
var uglify = require('gulp-uglify');
var notify = require('gulp-notify');
var concat = require('gulp-concat');
var rename = require('gulp-rename');
var nodeunit = require('gulp-nodeunit');
var rjs = require('requirejs');

var JS_FILE_PATH = 'public/javascripts/';
var CSS_FILE_PATH = 'public/stylesheets/';

var config = {
  baseUrl: JS_FILE_PATH,
  mainConfigFile: JS_FILE_PATH + 'config.js',
  out: JS_FILE_PATH + 'build/optimized.js',
  name: 'config'
};

gulp.task('styles', function () {
  return gulp.src(CSS_FILE_PATH + '*.css')
    .pipe(concat('main.css'))
    .pipe(rename({ suffix: '.min' }))
    .pipe(minifycss())
    .pipe(gulp.dest(CSS_FILE_PATH))
    .pipe(notify({ message: 'css task complete' }));
});

gulp.task('requirejs', function () {
    return rjs.optimize(config);
});

gulp.task('scripts', function () {
  return gulp.src([
      JS_FILE_PATH + 'lib/requirejs/require.js',
      JS_FILE_PATH + 'lib/jquery/jquery.js',
      JS_FILE_PATH + 'build/optimized.js'
    ])
    .pipe(concat('facespaces.js'))
    .pipe(rename({ suffix: '.min' }))
    .pipe(uglify({ mangle: false }))
    .pipe(gulp.dest(JS_FILE_PATH + 'build/'))
    .pipe(notify({ message: 'js task complete' }));
});

gulp.task('jshint', function () {
  return gulp.src([
      JS_FILE_PATH + '**/*.js',
      '!' + JS_FILE_PATH + 'build/*.js',
      '!' + JS_FILE_PATH + 'lib/**/*.js'
    ])
    .pipe(jshint())
    .pipe(jshint.reporter('default'))
    .pipe(notify({ message: 'jshint task complete' }));
});

gulp.task('tests', function () {
  return gulp.src('tests/*.js')
    .pipe(nodeunit({
      reporter: 'junit',
      reporterOptions: {
        output: 'tests'
      }
    }));
});

gulp.task('default', ['tests', 'jshint', 'styles', 'requirejs', 'scripts']);
