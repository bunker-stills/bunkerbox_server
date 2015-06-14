#ifndef _1W_DS2480_MASTER_H_
#define _1W_DS2480_MASTER_H_

/* Mode commands */
#define DS2480_MODE_DATA	0xE1
#define DS2480_MODE_CMD		0xE3
#define DS2480_PULSE_TERM	0xF1

/* Communication commands */
#define DS2480_CMD_BIT(s,x)		(0x81 | (s << 2) | (x << 4))
#define DS2480_CMD_ACCEL(s,a)	(0xa1 | (s << 2) | (a << 4))
#define DS2480_CMD_RESET(s)		(0xc1 | (s << 2))
#define DS2480_CMD_PULSE(p) 	(0xed | (p << 4))
#define DS2480_CMD_CFGW(p,v) 	((p << 4) | (v << 1) | 1)
#define DS2480_CMD_CFGR(p) 		((v << 1) | 1)

#define DS2480_WRITE0	0
#define DS2480_WRITE1	1
#define DS2480_READ		1

/* Reset respose */
#define DS2480_CMD_RESET_MASK	0x03
#define DS2480_CMD_RESET_SHORT	0
#define DS2480_CMD_RESET_PRES	1
#define DS2480_CMD_RESET_ALARM	2
#define DS2480_CMD_RESET_NOPRES	3

/* CFG response masks */
#define DS2480_CMD_CFG_MASK	0x7e
#define DS2480_CMD_CFG_VALUE(x)	((x & 0x0e) >> 1)
#define DS2480_CMD_CFG_CODE(x)	((x & 0x70) >> 4)

/* Configuration parameters */
#define DS2480_PARAM_PDSRC	0x01	/* Pulldown Slew Rate Control */
#define DS2480_PARAM_PPD	0x02	/* Programming Pulse Diration */
#define DS2480_PARAM_SPUD	0x03	/* Strong Pullup Duration */
#define DS2480_PARAM_W1LT	0x04	/* Write-1 Low Time */
#define DS2480_PARAM_DSO	0x05	/* Data Sample Offset/Write-0 Recovery Time */
#define DS2480_PARAM_LOAD	0x06	/* Load Sensor Threshold */
#define DS2480_PARAM_RBR	0x07	/* RS232 Baud Rate */


/* 1-wire speeds */
#define DS2480_SPEED_REG	0x00
#define DS2480_SPEED_FLEX	0x01
#define DS2480_SPEED_OD		0x02


void ds2480_ow_init(const char* port, const int baudRate);
void ds2480_ow_close();
uint8_t ds2480_ow_probe();
uint8_t ds2480_ow_devprobe(struct ow_dev *, uint8_t);
void ds2480_ow_skip_rom();
void ds2480_ow_rom_match(struct ow_dev *);
void ds2480_ow_writeb(uint8_t);
uint8_t ds2480_ow_readb();
#endif