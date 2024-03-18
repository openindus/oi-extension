#include "OpenIndus.h"
#include "Arduino.h"

void setup(void)
{
    // put your setup code here, to run once:
    Serial.begin(115200);
    Serial.println("Hello World !");
}

void loop(void)
{
    // put your main code here, to run repeatedly:
    delay(1000);
}