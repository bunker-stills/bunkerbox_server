#include <stdint.h>
#include <string.h>
#include <stdio.h>

#include "1wire.h"
#include "util.h"
#include "usart.h"
#include "ds2480.h"

#define USART 1

uint8_t __ds2480_resp;
uint8_t __ds2480_mode = 0xFF;

#define ds2480_set_mode(x) \
	if (__ds2480_mode != x) { \
		usart_transmit(x); \
		__ds2480_mode = x; \
		delayms(2); \
	}

void ds2480_ow_try()
{
    usart_set_baud(B9600);
    usart_break();
    delayms(2);
    usart_flush(USART);

    usart_transmit(DS2480_CMD_RESET(DS2480_SPEED_FLEX));
    delayms(10);
    usart_flush(USART);

    usart_transmit(DS2480_CMD_CFGW(DS2480_PARAM_PDSRC, 3)); /* 1.37 V/us */
    usart_receive(&__ds2480_resp);

    usart_transmit(DS2480_CMD_CFGW(DS2480_PARAM_W1LT, 3)); /* 11 us */
    usart_receive(&__ds2480_resp);

    usart_transmit(DS2480_CMD_CFGW(DS2480_PARAM_DSO, 7)); /* 10us */
    usart_receive(&__ds2480_resp);
}

void ds2480_ow_detect()
{
    int	retry = 0;

    while(retry++ < 5)
    {
        ds2480_ow_try();
    }
}

void ds2480_ow_init(const char* port, const int baudRate)
{
	usart_init(port, baudRate);
	ds2480_ow_detect();
}

void ds2480_ow_close()
{
	usart_close();
}

uint8_t
ds2480_ow_probe()
{

	ds2480_set_mode(DS2480_MODE_CMD);
	usart_transmit(DS2480_CMD_RESET(DS2480_SPEED_FLEX));
	usart_receive(&__ds2480_resp);
	return (__ds2480_resp & DS2480_CMD_RESET_MASK);
}

static int8_t
devprobe(uint8_t *p, int8_t state)
{
	uint8_t i, dir, id_bit, cmp_bit;
	uint8_t mask = 1;
	int8_t newstate = 0;

	if (ds2480_ow_probe() != DS2480_CMD_RESET_PRES)
		return (-1);

	ds2480_set_mode(DS2480_MODE_DATA);
	usart_transmit(OW_ROM_SEARCH);
	usart_receive(&__ds2480_resp);
	ds2480_set_mode(DS2480_MODE_CMD);

	usart_transmit(DS2480_CMD_ACCEL(DS2480_SPEED_FLEX, 0));

	/* i = bit number */
	for (i = 1; i <= OW_ROM_SZ; i++) {
		usart_transmit(DS2480_CMD_BIT(DS2480_SPEED_FLEX, DS2480_READ));
		usart_receive(&id_bit);
		id_bit &= 1;

		usart_transmit(DS2480_CMD_BIT(DS2480_SPEED_FLEX, DS2480_READ));
		usart_receive(&cmp_bit);
		cmp_bit &= 1;

		if (id_bit == 1 && cmp_bit == 1)
			return (-1);

		if (id_bit != cmp_bit)
			dir = id_bit;
		else {
			if (i < state)
				dir = (((*p) & mask) > 0);
			else
				dir = (i == state);

			if (dir == 0) {
				newstate = i;
			}
		}

		if (dir == 1)
			*p |= mask;
		else
			*p &= ~mask;

		usart_transmit(DS2480_CMD_BIT(DS2480_SPEED_FLEX, dir));
		usart_receive(&__ds2480_resp);

		mask <<= 1;
		if (mask == 0) {
			p++;
			mask = 1; 
		}
	}

	return (newstate);
}

uint8_t
ds2480_ow_devprobe(struct ow_dev *owd, uint8_t len)
{
	uint8_t i;
	int8_t state = 0;

	memset(owd, 0, sizeof(struct ow_dev) * len);

	for (i = 0; len > 0; len--) {
		state = devprobe((uint8_t *)&owd[i], state);
		if (state >= 0)
			i++;
		if (state <= 0)
			break;
		memcpy(&owd[i], &owd[i-1], sizeof(struct ow_dev));	
	}
	return (i);
}

void ds2480_ow_skip_rom()
{
	ds2480_set_mode(DS2480_MODE_DATA);
	usart_transmit(OW_SKIP_ROM);
	usart_receive(&__ds2480_resp);
}

void
ds2480_ow_rom_match(struct ow_dev *owd)
{
	uint8_t i;
	char *p = (char *)owd;

	ds2480_set_mode(DS2480_MODE_DATA);
	usart_transmit(OW_ROM_MATCH);
	usart_receive(&__ds2480_resp);

	for (i = 0; i < 8; i++) {
		usart_transmit(p[i]);

		// Requires us to transmit 0xE3 twice so it doesn't get confused with the config command
		if(p[i] == 0xE3)
		{
			usart_transmit(p[i]);
		}

		usart_receive(&__ds2480_resp);
	}
}

void
ow_writeb(uint8_t b)
{
	ds2480_set_mode(DS2480_MODE_DATA);
	usart_transmit(b);

	// Requires us to transmit 0xE3 twice so it doesn't get confused with the config command
	if(b == 0xE3)
	{
		usart_transmit(b);
	}

	usart_receive(&__ds2480_resp);
}

uint8_t
ow_readb()
{
	ds2480_set_mode(DS2480_MODE_DATA);
	usart_transmit(0xFF);
	usart_receive(&__ds2480_resp); 
	return (__ds2480_resp);
}