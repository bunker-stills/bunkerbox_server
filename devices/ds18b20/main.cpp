#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <termios.h>
#include <unistd.h>
#include <fcntl.h>
#include <stdint.h>

#include "1wire.h"
#include "ds1820.h"
#include "usart.h"
#include "util.h"

#define MAX_1W_DEV 10

int main(void)
{
	ow_init("/dev/ttyS1", B9600);

	struct ow_dev dev[MAX_1W_DEV];
	int deviceCount = ow_devprobe(dev, MAX_1W_DEV);

	printf("Found %d devices\n", deviceCount);

	int i = 0;
	uint8_t buf[2];

	while(true)
	{
		ow_ds1820_conv_all();

    	for (i = 0; i < deviceCount; i++)
    	{
    	    for(int index = 0; index < 6; index++)
            {
                printf("%02X", dev[i].owd_id[index]);
            }

			if (ow_ds1820_read(&dev[i], &buf[0], 2) != 0) {
				if (ow_ds1820_read(&dev[i], &buf[0], 2) != 0) {
					printf("\n**CRC Error**\n");
					continue;
				}
			}

			float temp = ((buf[1] << 8) + buf[0]) * 0.0625;
            printf(": %f\n", temp);
    	}

    	printf("*********\n");
    	delayms(500);
	}
}