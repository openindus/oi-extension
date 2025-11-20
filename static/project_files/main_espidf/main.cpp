#include "OpenIndus.h"
%MODULE_INIT%
void setup(void)
{
    // put your setup code here, to run once:
    printf("Hello World ! \n");
}

void loop(void)
{
    // put your main code here, to run repeatedly:
    vTaskDelay(1000);
}