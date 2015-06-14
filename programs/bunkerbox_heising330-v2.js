var si = require("./../sensor_interface.js");
var sensor_interface = new si();
var _ = require("underscore");

var mainHeaterCVMin;
var mainHeaterCVMax;

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

function mapRange(number, in_min , in_max , out_min , out_max ) {
    return Number(( number - in_min ) * ( out_max - out_min ) / ( in_max - in_min ) + out_min);
}

module.exports.setup = function(node330, config, runSwitch, mainHeaterPID, mainHeaterSetPoint, mainHeaterSetPointOffset, boilingPoint, mainHeaterProcessValueSensor, mainHeaterCurrentProcessValue, mainHeaterPGain, mainHeaterIGain, mainHeaterDGain, mainHeaterPower)
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
    mainHeaterSetPoint.setDisplayName("Main Heater Set Point");
    mainHeaterProcessValueSensor.setDisplayName("Main Heater Process Sensor Name");
    mainHeaterCurrentProcessValue.setDisplayName("Main Heater Current Process Value");
    mainHeaterPGain.setDisplayName("Main Heater P Gain");
    mainHeaterIGain.setDisplayName("Main Heater I Gain");
    mainHeaterDGain.setDisplayName("Main Heater D Gain");

    mainHeaterPower.setDisplayName("Main Heater Power");
    mainHeaterPower.setValueType(node330.valueTypes.PERCENT);

    mainHeaterSetPoint.setValueType(node330.valueTypes.TEMP_IN_F);
    mainHeaterProcessValueSensor.setValueType(node330.valueTypes.STRING);
    boilingPoint.setValueType(node330.valueTypes.TEMP_IN_F);

    // Set our default values
    mainHeaterSetPointOffset.setValue(config.getSetting("mainHeaterSetPointOffset", 0));
    mainHeaterProcessValueSensor.setValue(config.getSetting("mainHeaterProcessValueSensor", ""));

    mainHeaterCVMin = config.getSetting("mainHeaterCVMin", 0);
    mainHeaterCVMax = config.getSetting("mainHeaterCVMax", 4095)
    mainHeaterPID.setControlValueLimits(mainHeaterCVMin, mainHeaterCVMax, 0);
    mainHeaterPGain.setValue(config.getSetting("mainHeaterPGain", 1));
    mainHeaterIGain.setValue(config.getSetting("mainHeaterIGain", 1));
    mainHeaterDGain.setValue(config.getSetting("mainHeaterDGain", 0));

    node330.exposeVirtualComponentToViewers(runSwitch, false);
    node330.exposeVirtualComponentToViewers(mainHeaterPGain, false);
    node330.exposeVirtualComponentToViewers(mainHeaterIGain, false);
    node330.exposeVirtualComponentToViewers(mainHeaterDGain, false);
    node330.exposeVirtualComponentToViewers(mainHeaterSetPoint);
    node330.exposeVirtualComponentToViewers(mainHeaterSetPointOffset, false);
    node330.exposeVirtualComponentToViewers(boilingPoint);
    node330.exposeVirtualComponentToViewers(mainHeaterProcessValueSensor, false);
    node330.exposeVirtualComponentToViewers(mainHeaterCurrentProcessValue);
    node330.exposeVirtualComponentToViewers(mainHeaterPower);

    node330.addViewer(node330.restViewer());
    node330.addViewer(node330.webViewer());
};

module.exports.loop = function(node330, config, runSwitch, mainHeaterPID, mainHeaterSetPoint, mainHeaterSetPointOffset, boilingPoint, mainHeaterProcessValueSensor, mainHeaterCurrentProcessValue, mainHeaterPGain, mainHeaterIGain, mainHeaterDGain, mainHeaterPower)
{
    var bp = getCurrentBoilingPoint(sensor_interface.getSensorValue("AMB_PRESSURE"));

    boilingPoint.setValue(bp);
    mainHeaterSetPoint.setValue(bp - mainHeaterSetPointOffset.getValue());

    mainHeaterPID.setDesiredValue(mainHeaterSetPoint.tempInF());
    mainHeaterPID.setProportionalGain(mainHeaterPGain.getValue());
    mainHeaterPID.setIntegralGain(mainHeaterIGain.getValue());
    mainHeaterPID.setDerivativeGain(mainHeaterDGain.getValue());

    var processValueComponent = node330.getVirtualComponentNamed(mainHeaterProcessValueSensor.getValue());
    var processValue = undefined;

    if(processValueComponent)
    {
        processValue = processValueComponent.getValue();
    }
    else
    {
        var sumpTempProbes = config.getSetting("sumpTempProbes");

        if(_.isArray(sumpTempProbes))
        {
            _.each(sumpTempProbes, function(sumpTempProbeID){

                processValueComponent = node330.getVirtualComponentNamed(sumpTempProbeID);

                if(processValueComponent)
                {
                    if(_.isUndefined(processValue))
                    {
                        processValue = 0.0;
                    }

                    processValue = Math.max(processValue, processValueComponent.getValue());
                }

            });
        }
    }

    mainHeaterCurrentProcessValue.setValue(processValue);

    if(runSwitch.isOn())
    {
        if(!_.isUndefined(processValue))
        {
            cv = Math.round(mainHeaterPID.update(processValue));
        }
        else
        {
            cv = 0;
        }
    }
    else
    {
        cv = 0;
        mainHeaterPID.setIntegral(0);
    }

    mainHeaterPower.setValue(Math.max(0, Number(mapRange(cv, mainHeaterCVMin, mainHeaterCVMax, 0, 100).toFixed(2))));
    sensor_interface.setDAC(config.getSetting("mainHeaterChannel", 1), cv);

    // Save our settings for next time
    config.setSetting("mainHeaterProcessValueSensor", mainHeaterProcessValueSensor.getValue());
    config.setSetting("mainHeaterPGain", mainHeaterPGain.getValue());
    config.setSetting("mainHeaterIGain", mainHeaterIGain.getValue());
    config.setSetting("mainHeaterDGain", mainHeaterDGain.getValue());
    config.setSetting("mainHeaterSetPointOffset", mainHeaterSetPointOffset.getValue());
};