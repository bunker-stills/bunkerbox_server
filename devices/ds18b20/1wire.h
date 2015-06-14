#ifndef _1WIRE_H_
#define _1WIRE_H_

struct ow_dev;

#include "ds2480.h"

/*
 * 64-bit unique 1-wire device serial
 * ID is stored with MSB first.
 */
struct ow_dev {
	uint8_t	owd_fam;
	uint8_t	owd_id[6];
	uint8_t owd_crc;
}; //__attribute__((packed));

#define OW_ROM_SZ	64
#define OW_ROM_SEARCH	0xf0
#define OW_ROM_MATCH	0x55
#define OW_SKIP_ROM		0xCC

/* Use DS2480 as 1-wire master */
#define ow_init		ds2480_ow_init
#define ow_close		ds2480_ow_close
#define ow_probe	ds2480_ow_probe
#define ow_devprobe	ds2480_ow_devprobe
#define ow_rom_match ds2480_ow_rom_match
#define ow_skip_rom ds2480_ow_skip_rom
#define ow_writeb	ds2480_ow_writeb
#define ow_readb	ds2480_ow_readb

#endif /* _1WIRE_H_ */