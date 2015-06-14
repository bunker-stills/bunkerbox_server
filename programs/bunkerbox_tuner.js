var si = require("./../sensor_interface.js");
var sensor_interface = new si();

createPhysicalComponentForSubsensor = function(node330, sensorName, valueType)
{
	return node330.createPhysicalComponentWithValueFunction(valueType, function()
	{
		return sensor_interface.getSensorValue(sensorName);
	});
}

function getCurrentBoilingPoint(pressureInMBar)
{
	// Calculate our boiling point
	var baroInHG = pressureInMBar * 0.02953;
	var boilingPoint = Math.log(baroInHG) * 49.160999 + 44.93;

	return parseFloat(boilingPoint.toFixed(2));
}

module.exports.setup = function(node330, tunerConfig, runSwitch, testPID, setPoint, setPointOffset, boilingPoint, processValueSensor, currentProcessValue, pGain, iGain, dGain, currentCV, cvMin, cvMax, outputChannel)
{
	sensor_interface.begin();

	sensor_interface.on("new_sensor", function(newSensorName, newSensorValueType)
	{
		var virtualValueType = newSensorValueType;

		if(newSensorValueType == node330.valueTypes.TEMP_IN_C)
		{
			virtualValueType = node330.valueTypes.TEMP_IN_F;
		}

		var virtualComponent = node330.createVirtualComponent(newSensorName, virtualValueType);
		var physicalComponent = createPhysicalComponentForSubsensor(node330, newSensorName, newSensorValueType);
		node330.mapPhysicalComponentToVirtualComponent(physicalComponent, virtualComponent);

		node330.exposeVirtualComponentToViewers(virtualComponent);
	});

	runSwitch.setDisplayName("Run");
	setPoint.setDisplayName("Set Point");
	processValueSensor.setDisplayName("PID Process Sensor Name");
	currentProcessValue.setDisplayName("PID Current Process Value");
	pGain.setDisplayName("PID P Gain");
	iGain.setDisplayName("PID I Gain");
	dGain.setDisplayName("PID D Gain");
	currentCV.setDisplayName("PID Current Control Value");
	cvMin.setDisplayName("PID Control Value Min");
	cvMax.setDisplayName("PID Control Value Max");
	outputChannel.setDisplayName("PID DAC Output Channel");

	setPoint.setValueType(node330.valueTypes.TEMP_IN_F);
	processValueSensor.setValueType(node330.valueTypes.STRING);
	boilingPoint.setValueType(node330.valueTypes.TEMP_IN_F);

	// Set our default values
	setPointOffset.setValue(tunerConfig.getSetting("setPointOffset", 0));
	processValueSensor.setValue(tunerConfig.getSetting("processValueSensor", ""));
	pGain.setValue(tunerConfig.getSetting("pGain", 1));
	iGain.setValue(tunerConfig.getSetting("iGain", 1));
	dGain.setValue(tunerConfig.getSetting("dGain", 0));
	cvMin.setValue(tunerConfig.getSetting("cvMin", 0));
	cvMax.setValue(tunerConfig.getSetting("cvMax", 4095));
	outputChannel.setValue(tunerConfig.getSetting("outputChannel", 1));

	node330.exposeVirtualComponentToViewers(runSwitch, false);
	node330.exposeVirtualComponentToViewers(pGain, false);
	node330.exposeVirtualComponentToViewers(iGain, false);
	node330.exposeVirtualComponentToViewers(dGain, false);
	node330.exposeVirtualComponentToViewers(cvMin, false);
	node330.exposeVirtualComponentToViewers(cvMax, false);
	node330.exposeVirtualComponentToViewers(setPoint);
	node330.exposeVirtualComponentToViewers(setPointOffset, false);
	node330.exposeVirtualComponentToViewers(boilingPoint);
	node330.exposeVirtualComponentToViewers(processValueSensor, false);
	node330.exposeVirtualComponentToViewers(outputChannel, false);
	node330.exposeVirtualComponentToViewers(currentProcessValue);
	node330.exposeVirtualComponentToViewers(currentCV);

	node330.addViewer(node330.createWebViewer());

    if(tunerConfig.getSetting("dweet_enabled"))
    {
        node330.addViewer(node330.createRemoteServerViewer({
            thing: tunerConfig.getSetting("dweet_thing_id"),
            key: tunerConfig.getSetting("dweet_key")
        }));
    }
};

module.exports.loop = function(node330, tunerConfig, runSwitch, testPID, setPoint, setPointOffset, boilingPoint, processValueSensor, currentProcessValue, pGain, iGain, dGain, currentCV, cvMin, cvMax, outputChannel)
{
	var bp = getCurrentBoilingPoint(sensor_interface.getSensorValue("AMB_PRESSURE"));

	boilingPoint.setValue(bp);
	setPoint.setValue(bp - setPointOffset.getValue());

	testPID.setControlValueLimits(cvMin.getValue(), cvMax.getValue(), 0);

	testPID.setDesiredValue(setPoint.tempInF());
	testPID.setProportionalGain(pGain.getValue());
	testPID.setIntegralGain(iGain.getValue());
	testPID.setDerivativeGain(dGain.getValue());

	var cv = 0;

	var processValueComponent = node330.getVirtualComponentNamed(processValueSensor.getValue());
	var processValue = undefined;

	if(processValueComponent)
	{
		processValue = processValueComponent.getValue();

		if(processValue)
		{
			currentProcessValue.setValue(processValue);
		}
	}

	if(runSwitch.isOn())
	{
		if(processValue)
		{
			cv = Math.round(testPID.update(processValue));
		}
		else
		{
			currentProcessValue.setValue(undefined);
		}
	}
	else
	{
		testPID.setIntegral(0);
	}

	currentCV.setValue(cv);
	sensor_interface.setDAC(outputChannel.getValue(), cv);

	// Save our settings for next time
	tunerConfig.setSetting("processValueSensor", processValueSensor.getValue());
	tunerConfig.setSetting("pGain", pGain.getValue());
	tunerConfig.setSetting("iGain", iGain.getValue());
	tunerConfig.setSetting("dGain", dGain.getValue());
	tunerConfig.setSetting("cvMin", cvMin.getValue());
	tunerConfig.setSetting("cvMax", cvMax.getValue());
	tunerConfig.setSetting("outputChannel", outputChannel.getValue());
	tunerConfig.setSetting("setPointOffset", setPointOffset.getValue());
};