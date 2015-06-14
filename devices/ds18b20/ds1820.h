#ifndef _1W_DS1820_H_
#define _1W_DS1820_H_

/* Q4N fixed point format */
#define _Q4N(x) \
    ((((x) & 0x8) ? 5000 : 0) + \
    (((x) & 0x4) ? 2500 : 0) + \
    (((x) & 0x2) ? 1250 : 0) + \
    (((x) & 0x1) ? 625 : 0))

/* Format strings and macros for printf-style functions */
#define OW_DS18B20_FMT "%s%d.%.4d"
#define OW_DS18B20_TEMP(ms, ls) \
    (ms) & 0xf8 ? "-" : "", \
    OW_DS18B20_INT(ms, ls), OW_DS18B20_FRAC(ms, ls)

/* Returns integer part of temperature value */
#define OW_DS18B20_INT(ms, ls) (signed char)((ms & 0xf8) ? \
    (((~ms & 0x7) << 4) | (~(ls >> 4) & 0xf)) : \
    (((ms & 0x7) << 4) | (ls >> 4)))

/* Returns fractional part of temperature value */
#define OW_DS18B20_FRAC(ms, ls) ((ms & 0xf8) ? _Q4N((~ls & 0xf) + 1) : _Q4N(ls & 0xf))

int8_t ow_ds1820_read(struct ow_dev *, uint8_t *, char);
void ow_ds1820_conv(struct ow_dev *);
void ow_ds1820_conv_all();
#endif