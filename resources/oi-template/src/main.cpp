#include "OpenIndus.h"

OICore core;

extern "C" void app_main()
{
    SYSTEM.setModule(&core);
    SYSTEM.start();
    CONSOLE.start();

    printf("Hello World\n");

    while (1)
    {
        vTaskDelay(portMAX_DELAY);
    }
}
