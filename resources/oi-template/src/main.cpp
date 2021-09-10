#include "OpenIndus.h"

REPLACE_CLASS_HERE REPLACE_NAME_HERE;

extern "C" void app_main()
{
    SYSTEM.setModule(&REPLACE_NAME_HERE);
    SYSTEM.start();
    CONSOLE.start();

    printf("Hello World\n");

    while (1)
    {
        vTaskDelay(portMAX_DELAY);
    }
}
