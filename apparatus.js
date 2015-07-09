var events = require('events');
var util = require('util');
var _ = require('underscore');

// apparatus.js implements the generic apparatus interface for bunkerbox programs.
// The interface consists of constructor, begin(), end(), and restart().
// Events emitted are "timeout" and "apparatus_error".
// These functions and events are simply pass-through to the underlying specific interface.
// The main contribution of this module is in loading the specific module and
// setting up the signal and control components for events "new_signal" and "new_control".
//
// The constructor arguments are node330 and apparatus_config.  The latter
// is a config file and must have an entry named 'interface_module'
// which is the specific apparatus interface.  The specific interface is a
// js module/object that provides methods begin(), end(), restart(), and
// getSignalValue(signal_name) and setControlValue(control_name, value).
// The specific interface emits events "new_signal", "new_control",
// "timeout" and "apparatus_error".
//

createPhysicalComponentForSignal = function (node330, si, signalName, valueType) {
    return node330.createPhysicalComponentWithValueFunction(valueType,
        function () {
            return si.getSignalValue(signalName);
        });
}

createPhysicalComponentForControl = function (node330, si, controlName, valueType) {
    return node330.createPhysicalComponentWithSetterFunction(valueType,
        function(value) {
            return si.setControlValue(controlName, value);
        });
}

function apparatus_interface(node330, apparatus_config)
{
    var self = this;
    var si = require(apparatus_config.interface_module);
    signal_interface = new si(node330, apparatus_config);

    self.begin = function() {
        signal_interface.begin();
    }
    self.end = function() {
        signal_interface.end();
    }
    self.restart = function() {
        signal_interface.restart();
    }

    signal_interface.on("new_signal", function (newSignalName, newSignalValueType) {

        node330.logInfo("Found signal " + newSignalName);

        var physicalComponent = createPhysicalComponentForSignal(node330,
                                                                 signal_interface,
                                                                 newSignalName,
                                                                 newSignalValueType);

        var componentName;
        if (_.str.startsWith(newSignalName, "sensor_"))
        {
            componentName = _.str.strRight(newSignalName, 'sensor_');
        }
        else if (_.str.endsWith(newSignalName, "_sensor"))
        {
            componentName = _.str.strLeft(newSignalName, '_sensor');
        }
        else if (_.str.startsWith(newSignalName, "probe_"))
        {
            componentName = _.str.strRight(newSignalName, 'probe_');
        }
        else if (_.str.endsWith(newSignalName, "_probe"))
        {
            componentName = _.str.strLeft(newSignalName, '_probe');
        }
        else if (_.str.startsWith(newSignalName, "pin_"))
        {
            componentName = _.str.strRight(newSignalName, 'pin_');
        }
        else if (_.str.endsWith(newSignalName, "_pin"))
        {
            componentName = _.str.strLeft(newSignalName, '_pin');
        }
        else
        {
            componentName = newSignalName;
        }
        try
        {
            node330.mapPhysicalComponentToVirtualComponent(physicalComponent,
                                                           componentName);
        }
        catch(e)
        {
            node330.logWarning("Signal " + componentName + " not used by program.");
        }
    });

    signal_interface.on("new_control", function (newControlName, newControlValueType, initialValue) {

        node330.logInfo("Found control " + newControlName);

        var physicalComponent = createPhysicalComponentForControl(node330,
                                                                  signal_interface,
                                                                  newControlName,
                                                                  newControlValueType);
        physicalComponent.value = initialValue;

        var componentName;
        if (_.str.startsWith(newControlName, "dac_"))
        {
            componentName = _.str.strRight(newControlName, 'dac_');
        }
        else if (_.str.endsWith(newControlName, "_dac"))
        {
            componentName = _.str.strLeft(newControlName, '_dac');
        }
        else if (_.str.startsWith(newControlName, "control_"))
        {
            componentName = _.str.strRight(newControlName, 'control_');
        }
        else if (_.str.endsWith(newControlName, "_control"))
        {
            componentName = _.str.strLeft(newControlName, '_control');
        }
        else
        {
            componentName = newControlName;
        }
        try
        {
            node330.mapPhysicalComponentToVirtualComponent(physicalComponent,
                                                           componentName);
        }
        catch(e)
        {
            node330.logWarning("Control " + componentName + " not used by program.");
        }
    });

    // Propagate timeout and error events to client
    signal_interface.on("timeout", function(signalName)
    {
        self.emit('timeout', signalName);
    });
    signal_interface.on('apparatus_error', function(source)
    {
        self.emit('apparatus_error', source);
    });
}

util.inherits(apparatus_interface, events.EventEmitter);

module.exports = apparatus_interface;
