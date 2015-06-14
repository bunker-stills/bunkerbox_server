var ds18b20 = require("./build/Release/ds18b20");

var sensorInterface = new si();

var readline = require('readline');

var rl = readline.createInterface({
	input : process.stdin,
	output: process.stdout
});

function setDAC(dacNumber, value)
{
	sensorInterface.setDAC(dacNumber, value);
}

function getDACInput()
{
	rl.question("Enter a DAC Number [1-6]: ", function(dacNumber)
	{
		rl.question("Enter a Value: [0-4095]: ", function(value)
		{
			setDAC(Number(dacNumber), Number(value));
			getDACInput();
		});
	});
}

sensorInterface.begin();

getDACInput();