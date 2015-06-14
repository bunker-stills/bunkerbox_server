#!/usr/bin/python

from Adafruit_BMP085 import BMP085
import time
import json

# ===========================================================================
# Example Code
# ===========================================================================

# Initialise the BMP085 and use STANDARD mode (default value)
# bmp = BMP085(0x77, debug=True)
# bmp = BMP085(0x77)

# To specify a different operating mode, uncomment one of the following:
# bmp = BMP085(0x77, 0)  # ULTRALOWPOWER Mode
# bmp = BMP085(0x77, 1)  # STANDARD Mode
bmp = BMP085(0x77, 2)  # HIRES Mode
# bmp = BMP085(0x77, 3)  # ULTRAHIRES Mode

while True:

	temp = bmp.readTemperature()

	# Read the current barometric pressure level
	pressure = bmp.readPressure()

	print json.dumps({'temp':temp,'press':pressure})

	time.sleep( 1 )
