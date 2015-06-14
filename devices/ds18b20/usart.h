#ifndef _USART_H_
#define _USART_H_

#include <termios.h>

void usart_init(const char* port, const int baud);
void usart_close();
void usart_flush(const int count);
void usart_transmit(const uint8_t byte);
void usart_receive(uint8_t* byte);
void usart_set_baud(speed_t baud);
void usart_break();

#endif /* _USART_H_ */