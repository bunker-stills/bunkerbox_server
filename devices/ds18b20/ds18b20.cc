#include <node.h>
#include <v8.h>
#include <stdlib.h>
#include <stdio.h>
#include <stdint.h>
#include <unistd.h>
#include <fcntl.h>

#include "1wire.h"
#include "ds1820.h"

using namespace v8;

#define MAX_1W_DEV 20

struct device_temp {
	char deviceID[13];
	float temp;
	bool crcError;
};

static uint8_t deviceCount = 0;
static struct ow_dev devices[MAX_1W_DEV];
static struct device_temp deviceTemps[MAX_1W_DEV];

static bool begun = false;
static bool gettingTemps = false;

struct callback_work {
  uv_work_t req;
  Persistent<Function> callback;
};

void getTemps(uv_work_t* req)
{
    if(!begun)
    {
        return;
    }

	uint8_t buf[2];

    gettingTemps = true;

    //printf("Converting\n");
	ow_ds1820_conv_all();

	for (int index = 0; index < deviceCount && begun; index++)
    {
        //printf("Reading: %d\n", index);

        // Read once
		if (ow_ds1820_read(&devices[index], &buf[0], 2) != 0)
		{
		    // Read twice if there is a problem the first time
			if (ow_ds1820_read(&devices[index], &buf[0], 2) != 0) {
				deviceTemps[index].crcError = true;
				continue;
			}
		}

		deviceTemps[index].crcError = false;
		deviceTemps[index].temp = ((buf[1] << 8) + buf[0] ) * 0.0625;
    }

    //printf("Finished Reading\n");

    gettingTemps = false;
}

void getTempsAfter(uv_work_t* req)
{
	HandleScope scope;

    callback_work* work = static_cast<callback_work*>(req->data);

	if(!work->callback.IsEmpty())
	{
		int validTempCount = 0;

		for(int index = 0; index < deviceCount; index++)
		{
			if(!deviceTemps[index].crcError)
			{
				validTempCount++;
			}
		}

        Local<Object> tempsObject = Object::New();

        for(int index = 0; index < deviceCount; index++)
		{
			if(!deviceTemps[index].crcError)
			{
				tempsObject->Set(String::NewSymbol(deviceTemps[index].deviceID), Number::New(deviceTemps[index].temp));
			}
		}

		Handle<Value> argv[0];
		argv[0] = tempsObject;

		TryCatch try_catch;

		node::MakeCallback(Context::GetCurrent()->Global(),
							 work->callback,
							 1,
							 argv);

		if (try_catch.HasCaught())
		{
			node::FatalException(try_catch);
		}
	}

    work->callback.Dispose();
    work->callback.Clear();

    delete work;
}

void findDevices(uv_work_t* req)
{
	ow_init("/dev/ttyS1", B9600);
	deviceCount = ow_devprobe(devices, MAX_1W_DEV);

	// Create strings for our device names
	for(int index = 0; index < deviceCount; index++)
	{
		for (int index2 = 0; index2 < 6; index2++)
		{
            sprintf(deviceTemps[index].deviceID + index2 * 2, "%02X", devices[index].owd_id[index2]);
        }

        deviceTemps[index].deviceID[12] = 0;
	}
}

void findDevicesAfter(uv_work_t* req)
{
	HandleScope scope;

    callback_work* work = static_cast<callback_work*>(req->data);

	if(!work->callback.IsEmpty())
	{
		Handle<Value> argv[0];
		argv[0] = Undefined();

		TryCatch try_catch;

		node::MakeCallback(Context::GetCurrent()->Global(),
							 work->callback,
							 1,
							 argv);

		if (try_catch.HasCaught())
		{
			node::FatalException(try_catch);
		}
	}

    work->callback.Dispose();
    work->callback.Clear();

    delete work;
}

Handle<Value> Begin(const Arguments& args)
{
	HandleScope scope;

	if(!begun)
	{
	    for (int index = 0; index < MAX_1W_DEV; index++)
        {
            deviceTemps[index].crcError = false;
            deviceTemps[index].temp = 0.0;
        }

		HandleScope scope;

		callback_work* work = new callback_work;
		work->req.data = work;

		if(args[0]->IsFunction())
		{
			work->callback = Persistent<Function>::New(args[0].As<Function>());
		}

		uv_queue_work(uv_default_loop(), &work->req, findDevices, (uv_after_work_cb)findDevicesAfter);

		begun = true;
	}

	return scope.Close(Undefined());
}

Handle<Value> ResetConnection(const Arguments& args)
{
    HandleScope scope;

    begun = false;

    //printf("Waiting...\n");

    // Wait until we've gotten all of our temps
    while(gettingTemps)
    {
        usleep(1);
    }

    //printf("Closing...\n");

    ow_close();

    usleep(500);

    ow_init("/dev/ttyS1", B9600);
    begun = true;

    return scope.Close(Undefined());
}

Handle<Value> End(const Arguments& args)
{
	HandleScope scope;

	if(begun)
    {
		ow_close();
		deviceCount = 0;
		begun = false;
    }

	return scope.Close(Undefined());
}

Handle<Value> GetTemps(const Arguments& args)
{
	HandleScope scope;

	if(begun)
	{
		HandleScope scope;

		callback_work* work = new callback_work;
		work->req.data = work;

		if(args[0]->IsFunction())
		{
			work->callback = Persistent<Function>::New(args[0].As<Function>());
		}

		uv_queue_work(uv_default_loop(), &work->req, getTemps, (uv_after_work_cb)getTempsAfter);
	}

	return scope.Close(Undefined());
}

void Init(Handle<Object> exports, Handle<Object> module)
{
	exports->Set(String::NewSymbol("begin"), FunctionTemplate::New(Begin)->GetFunction());
	exports->Set(String::NewSymbol("end"), FunctionTemplate::New(End)->GetFunction());
	exports->Set(String::NewSymbol("resetConnection"), FunctionTemplate::New(ResetConnection)->GetFunction());
	exports->Set(String::NewSymbol("getTemps"), FunctionTemplate::New(GetTemps)->GetFunction());
}

NODE_MODULE(ds18b20, Init)