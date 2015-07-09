//var segvhandler = require('segvhandler');
//segvhandler.registerHandler();

var node330 = require("node330");
var argv = require('optimist').argv;
var _ = require("underscore");
var fs = require("fs");
var pathx = require("path");

var config = {};

config = _.defaults(config, {
	program: argv.program || argv.p,
    config: argv.config || argv.c,
    apparatus: argv.apparatus || argv.a
});

if(_.isUndefined(config.program))
{
	console.log("Must specify a program to run with --program | --p <program_filename>");
	return;
}

if(_.isUndefined(config.apparatus))
{
	console.log("Must specify an apparatus configuration with --apparatus | --a <apparatus config file name>");
	return;
}


if(!fs.existsSync(pathx.join(process.cwd(), config.program)))
{
    if(fs.existsSync(pathx.join(process.cwd(), config.program+".js")))
    {
        config.program = pathx.join(config.program+".js");
    }
    else
    {
        if(fs.existsSync(pathx.join(process.cwd(), "programs", config.program)))
        {
            config.program = pathx.join("programs", config.program);
        }
        else
        {
            if(fs.existsSync(pathx.join(process.cwd(), "programs", config.program+".js")))
            {
                config.program = pathx.join("programs", config.program+".js");
            }
        }
    }
}

if(_.isUndefined(config.config))
{
    config.config = "config_" + pathx.basename(config.program, '.js');
}

if(_.isUndefined(config.apparatus))
{
    config.apparatus = "apparatus_" + pathx.basename(config.program, '.js');
}

node330.run(config);


function writeWatchdog()
{
	fs.writeFile("/tmp/bunker_watchdog.io", Date.now());
}

// Start our watchdog timer
setInterval(function(){

	writeWatchdog();

}, 4000);

writeWatchdog();
