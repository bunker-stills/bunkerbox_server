#include <stdint.h>
#include <stdio.h>
#include "1wire.h"
#include "ds1820.h"
#include "util.h"

#define DS1820_CONV	0x44
#define DS1820_READ	0xbe

static uint8_t crc8(uint8_t input, uint8_t crc)
{
	uint8_t fb;
	int i;

	for (i = 0; i < 8; i++) {
		fb = (crc ^ input) & 0x01;
		if (fb)
			crc ^= 0x18;
		crc = (crc >> 1) & 0x7f;
		if (fb)
			crc |= 0x80;
		input >>= 1;
	}
	return (crc);
}

void ow_ds1820_conv_all()
{
	ow_probe();
	ow_skip_rom();
	ow_writeb(DS1820_CONV);
}

void ow_ds1820_conv(struct ow_dev *owd)
{
	ow_probe();
	ow_rom_match(owd);
	ow_writeb(DS1820_CONV);
}

int8_t ow_ds1820_read(struct ow_dev *owd, uint8_t *buf, char len)
{
	unsigned char i;
	uint8_t tmp, crc_check = 0;

	ow_probe();
	ow_rom_match(owd);
	ow_writeb(DS1820_READ);

	for (i = 0; i < 9; i++) {
		tmp = ow_readb();

		if (i < len)
			buf[i] = tmp;

		if (i < 8)
			crc_check = crc8(tmp, crc_check);
	}
	return (crc_check == tmp) ? 0 : -1;
}