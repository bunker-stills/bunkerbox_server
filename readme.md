# Bunkerbox Server

### Requirements

- node.js version 0.10 or higher

### To install the first time

Install all of the project dependencies:

`$ npm install`

Build the native code extensions to interface with the sensor daughterboard:

`$ npm build`

### To run the server

`$ node bunkerbox_run -p <path_to_program_file>`

The standard program for the current Heising-330 still is at `programs/bunkerbox_heising330.js`. So in this case:

`$ node bunkerbox_run -p programs/bunkerbox_heising330.js`

### Running the watchdog program

The program writes values to the daughterboard to adjust the DAC circuits every 1 second. In the case that the program crashes and can't be restarted, there is a concern that the DAC circuits would remain in an unknown state and could cause any equipment connected to them (most commonly industrial heaters) to overheat and result in a dangerous situation. In this case, there is a separate program called Bunkerbox Watchdog that checks to make sure the Bunkbox Server program is running and sets all of the DACs to a failsafe (usually 0 volts) value.

The main `bunkerbox_run.js` program writes a timestamp to a file every second and the Watchdog reads that file every second. If the timestamp written in the file does not match the current system time within a reasonable amount, the Watchdog program will send the DACs into failsafe.

To run the watchdog program:

`$ node bunkerbox_watchdog`
