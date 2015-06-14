//var SegfaultHandler = require('segfault-handler');
//SegfaultHandler.registerHandler();

var node330 = require("node330");
var argv = require('optimist').argv;
var _ = require("underscore");
var fs = require("fs");

var config = {};

config = _.defaults(config, {
	program: argv.program || argv.p
});

if(_.isUndefined(config.program))
{
	console.log("Must specify a program to run with --program | --p <program_filename or npm_name>");
	return;
}
else
{
	node330.run(config);
}

function writeWatchdog()
{
	fs.writeFile("/tmp/bunker_watchdog.io", Date.now());
}

// Start our watchdog timer
setInterval(function(){

	writeWatchdog();

}, 4000);

writeWatchdog();