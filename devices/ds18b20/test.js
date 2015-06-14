var ds18b20Class = require("./../../build/Release/ds18b20");

function getTemps()
{
	var start = Date.now();

	ds18b20Class.getTemps(function(temps)
	{
		var elapsed = (Date.now() - start) / 1000;
		console.log(JSON.stringify(temps) + " TTR: " + elapsed);
		setTimeout(getTemps, 1000);
	});
}

ds18b20Class.begin(function(){
	console.log("Started!");
	getTemps();
});