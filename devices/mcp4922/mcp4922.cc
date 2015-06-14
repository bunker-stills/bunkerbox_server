#include <node.h>
#include <stdio.h>
#include <stdint.h>
#include <unistd.h>
#include <fcntl.h>
#include <string.h>
#include <sys/ioctl.h>
#include <linux/spi/spidev.h>

using namespace v8;

#define SPI_MODE0 0x00  // rest = 0, latch on rise

#define GPIO_MODE_PATH "/sys/devices/virtual/misc/gpio/mode/"
#define GPIO_PIN_PATH "/sys/devices/virtual/misc/gpio/pin/"
#define GPIO_FILENAME "gpio"

#define HIGH '1'
#define LOW  '0'

#define INPUT  '0'
#define OUTPUT '1'
#define INPUT_PU '8'
#define SPI '2'

static const char *spi_name = "/dev/spidev0.0";

int pinMode[18];
int pinData[18];
int spiDev;

void writeFile(int fileID, int value);
void setPinMode(int pinID, int mode);
void setPin(int pinID, int state);

Handle<Value> SetDAC(const Arguments& args) {
  HandleScope scope;

	int res = 0;

  if (args.Length() < 3) {
    ThrowException(Exception::TypeError(String::New("Wrong number of arguments")));
    return scope.Close(Undefined());
  }

  if (!args[0]->IsNumber() || !args[1]->IsNumber() || !args[2]->IsNumber()) {
    ThrowException(Exception::TypeError(String::New("Wrong arguments")));
    return scope.Close(Undefined());
  }

  int chipSelectPin = args[0]->NumberValue();
  int channel = args[1]->NumberValue();
  uint16_t value = args[2]->NumberValue();

  setPinMode(pinMode[chipSelectPin], OUTPUT);

  unsigned char dacSPI0 = 0x70;
  unsigned char dacSPI1 = 0;

    if(channel >= 1)
      dacSPI0 |= (1 << 7);    // A/B: DACa or DACb - Forces 7th bit  of    x to be 1. all other bits left alone.
    else
      dacSPI0 |= (0 << 7);

	dacSPI0 |= (value >> 8) & 0x00FF; //byte0 = takes bit 15 - 12
    dacSPI1 = value & 0x00FF; //byte1 = takes bit 11 - 0

  setPin(pinData[chipSelectPin], LOW);

	struct spi_ioc_transfer xfer;
	memset(&xfer, 0, sizeof(xfer));
	char dataBuffer[3];
	char rxBuffer[3];

	dataBuffer[0] = dacSPI0;
	dataBuffer[1] = dacSPI1;
	dataBuffer[2] = 0x00;
	xfer.tx_buf = (unsigned long)dataBuffer;
	xfer.rx_buf = (unsigned long)rxBuffer;
	xfer.len = 3;
	xfer.speed_hz = 500000;
	xfer.cs_change = 1;
	xfer.bits_per_word = 8;
	res = ioctl(spiDev, SPI_IOC_MESSAGE(1), &xfer);

	setPin(pinData[chipSelectPin], HIGH);

	setPin(pinData[chipSelectPin], LOW);
	setPin(pinData[chipSelectPin], HIGH);

  return scope.Close(Undefined());
}

void Init(Handle<Object> exports)
{
  exports->Set(String::NewSymbol("setDAC"),
      FunctionTemplate::New(SetDAC)->GetFunction());

  int i = 0;       // Loop iterator

char path[256];

for (i = 2; i <= 17; i++)
  {
    // Clear the path variable...
    memset(path,0,sizeof(path));
    // ...then assemble the path variable for the current pin mode file...
    sprintf(path, "%s%s%d", GPIO_MODE_PATH, GPIO_FILENAME, i);
    // ...and create a file descriptor...
    pinMode[i] = open(path, O_RDWR);

    // ...then rinse, repeat, for the pin data files.
    memset(path,0,sizeof(path));

    sprintf(path, "%s%s%d", GPIO_PIN_PATH, GPIO_FILENAME, i);
    pinData[i] = open(path, O_RDWR);
  }

  for (i = 10; i<=13; i++)
    {
      setPinMode(pinMode[i], SPI);
    }

	spiDev = open(spi_name, O_RDWR);
	int mode = SPI_MODE0;
	ioctl(spiDev, SPI_IOC_WR_MODE, &mode);

	int lsb_setting = 0;
	ioctl(spiDev, SPI_IOC_WR_LSB_FIRST, &lsb_setting);

	int bits_per_word = 0;
	ioctl(spiDev, SPI_IOC_WR_BITS_PER_WORD, &bits_per_word);
}

void setPinMode(int pinID, int mode)
{
  writeFile(pinID, mode);
}

void setPin(int pinID, int state)
{
  writeFile(pinID, state);
}

void writeFile(int fileID, int value)
{
  char buffer[4];  // A place to build our four-byte string.
  memset((void *)buffer, 0, sizeof(buffer)); // clear the buffer out.
  sprintf(buffer, "%c", value);
  lseek(fileID, 0, SEEK_SET);   // Make sure we're at the top of the file!
  write(fileID, buffer, sizeof(buffer));
}

NODE_MODULE(mcp4922, Init)