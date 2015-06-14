{
	"targets": [
		{
			"target_name": "mcp4922",
			"sources"    : [ "./devices/mcp4922/mcp4922.cc" ]
		},
        {
            "target_name": "ds18b20",
            "sources"    : [
                "./devices/ds18b20/ds18b20.cc",
                "./devices/ds18b20/ds2480.cc",
                "./devices/ds18b20/ds1820.cc",
                "./devices/ds18b20/usart.cc",
            ]
        }
	]
}