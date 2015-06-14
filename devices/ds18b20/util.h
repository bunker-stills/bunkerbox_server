#include <unistd.h>

static void inline delayms(uint16_t millis)
{
	usleep(millis * 1000);
}

static void inline delayus(uint16_t us)
{
	usleep(us);
}