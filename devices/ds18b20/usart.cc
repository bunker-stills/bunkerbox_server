#include <stdarg.h>
#include <stdint.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include "usart.h"

#define SERIAL 3

#define GPIO_MODE_PATH "/sys/devices/virtual/misc/gpio/mode/"
#define GPIO_FILENAME "gpio"

void writeFile(int fileID, int value);
void setPinMode(int pinID, int mode);

int serialPort = -1; // File descriptor for serial port

// Life is easier if we make a constant for our port name.
//static const char* portName = "/dev/ttyS1";

void usart_init(const char* port, const int baud)
{
	usart_close();

	// The very first thing we need to do is make sure that the pins are set
	//   to SERIAL mode, rather than, say, GPIO mode.
	char path[256];

	int i;
	for (i = 0; i<=1; i++)
	{
		// Clear the path variable...
		memset(path,0,sizeof(path));
		// ...then assemble the path variable for the current pin mode file...
		sprintf(path, "%s%s%d", GPIO_MODE_PATH, GPIO_FILENAME, i);
		// ...and create a file descriptor...
		int pinMode = open(path, O_RDWR);
		// ...which we then use to set the pin mode to SERIAL...
		setPinMode(pinMode, SERIAL);
		// ...and then, close the pinMode file.
		close(pinMode);
	}

    struct termios t;               // see man termios - declared as above
    int rc;

    serialPort = open(port, O_RDWR|O_NONBLOCK);
    tcgetattr(serialPort, &t);

    cfsetospeed(&t, B9600);
    cfsetispeed (&t, B9600);

    // Get terminal parameters. (2.00) removed raw
    tcgetattr(serialPort,&t);

    // Set to non-canonical mode, and no RTS/CTS handshaking
    t.c_iflag &= ~(BRKINT|ICRNL|IGNCR|INLCR|INPCK|ISTRIP|IXON|IXOFF|PARMRK);
    t.c_iflag |= IGNBRK|IGNPAR;
    t.c_oflag &= ~(OPOST);
    t.c_cflag &= ~(CRTSCTS|CSIZE|HUPCL|PARENB);
    t.c_cflag |= (CLOCAL|CS8|CREAD);
    t.c_lflag &= ~(ECHO|ECHOE|ECHOK|ECHONL|ICANON|IEXTEN|ISIG);
    t.c_cc[VMIN] = 0;
    t.c_cc[VTIME] = 3;

    rc = tcsetattr(serialPort, TCSAFLUSH, &t);
    tcflush(serialPort,TCIOFLUSH);
}

void usart_break()
{
    int duration = 0;
    tcsendbreak(serialPort, duration);
}

void usart_set_baud(speed_t baud)
{
   struct termios t;

   // read the attribute structure
   tcgetattr(serialPort, &t);

   // set baud in structure
   cfsetospeed(&t, baud);
   cfsetispeed(&t, baud);

   // change baud on port
   tcsetattr(serialPort, TCSAFLUSH, &t);
}

void usart_close()
{
	if(serialPort != -1)
	{
		close(serialPort);
	}

	serialPort = -1;
}

void usart_flush(const int count)
{
	tcflush(serialPort, TCIOFLUSH);
}

void usart_transmit(const uint8_t byte)
{
	write(serialPort, &byte, 1);
}

void usart_receive(uint8_t* byte)
{
	fcntl(serialPort, F_SETFL, 0); // block until data comes in

	int timeout = 10;
	while(timeout > 0 && read(serialPort,byte,1) == 0)
	{
		timeout--;
	}
}

void setPinMode(int pinID, int mode)
{
  	writeFile(pinID, mode);
}

// While it seems okay to only *read* the first value from the file, you
//   seemingly must write four bytes to the file to get the I/O setting to
//   work properly. This function does that.
void writeFile(int fileID, int value)
{
	char buffer[4];  // A place to build our four-byte string.
	memset((void *)buffer, 0, sizeof(buffer)); // clear the buffer out.
	sprintf(buffer, "%d", value);
	lseek(fileID, 0, SEEK_SET);   // Make sure we're at the top of the file!
	int res = write(fileID, buffer, sizeof(buffer));
}