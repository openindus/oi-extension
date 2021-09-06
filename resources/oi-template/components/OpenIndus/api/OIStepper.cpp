/**
 * Copyright (C) OpenIndus, Inc - All Rights Reserved
 *
 * This file is part of OpenIndus Library.
 *
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * 
 * @file OIStepper.h
 * @brief Functions for stepper module
 *
 * For more information on OpenIndus:
 * @see https://openindus.com
 */

#include "OIStepper.h"

#ifdef CONFIG_OI_STEPPER

static const char OI_STEPPER_TAG[] = "OIStepper";

#define BUSY_INTERRUPT_EVENT    (1 << 0)
#define ERROR_HANDLER_EVENT     (1 << 1)
#define FLAG_INTERRUPT_EVENT    (1 << 2)
#define ETOR1_INTERRUPT_EVENT   (1 << 3)
#define ETOR2_INTERRUPT_EVENT   (1 << 4)
#define ETOR3_INTERRUPT_EVENT   (1 << 5)
#define ETOR4_INTERRUPT_EVENT   (1 << 6)

TaskHandle_t OIStepper::_taskHandle = NULL;
EventGroupHandle_t OIStepper::_eventGroupHandle = NULL;

int OIStepper::_limitSwitchToMotor[4] = {-1, -1, -1, -1};
bool OIStepper::_limitSwitchToNotify[4] = {false, false, false, false};

const gpio_num_t OIStepper::_etor[4] = { 
    OISTEPPER_GPIO_PIN_ETOR1,
    OISTEPPER_GPIO_PIN_ETOR2,
    OISTEPPER_GPIO_PIN_ETOR3,
    OISTEPPER_GPIO_PIN_ETOR4,
};

#ifdef CONFIG_L6470
L6470_DeviceConfig_t OIStepper::device_conf;
#else
Powerstep01_DeviceConfig_t OIStepper::device_conf;
#endif

void OIStepper::init()
{
    OIModule::init();

    /* Init GPIO service */
    gpio_install_isr_service(ESP_INTR_FLAG_DEFAULT);

    /* Hardware init */
    ESP_LOGI(OI_STEPPER_TAG, "Hardware initialization");

    /* ETOR */
    gpio_config_t etor_conf = {
        .pin_bit_mask = ((1ULL<<OISTEPPER_GPIO_PIN_ETOR1) |
                        (1ULL<<OISTEPPER_GPIO_PIN_ETOR2) |
                        (1ULL<<OISTEPPER_GPIO_PIN_ETOR3) |
                        (1ULL<<OISTEPPER_GPIO_PIN_ETOR4)),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_ANYEDGE,
    };

    ESP_ERROR_CHECK(gpio_config(&etor_conf));

    /* Initialize powerstep01 devices */
     device_conf = {
        .spi_host = OISTEPPER_SPI_HOST,
        .spi_freq = OISTEPPER_SPI_FREQ,

        .spi_pin_mosi = OISTEPPER_SPI_PIN_MOSI,
        .spi_pin_miso = OISTEPPER_SPI_PIN_MISO,
        .spi_pin_clk = OISTEPPER_SPI_PIN_CLK,
        .spi_pin_cs = OISTEPPER_SPI_PIN_CS,

        .pin_busy_sync = OISTEPPER_GPIO_PIN_BUSY_SYNC,
        .pin_flag = OISTEPPER_GPIO_PIN_FLAG,

        .num_of_devices = OISTEPPER_NUMBER_OF_DEVICES,

        .pin_sw = {OISTEPPER_GPIO_PIN_D1_SW, 
                   OISTEPPER_GPIO_PIN_D2_SW},
        .pin_stby_rst = {OISTEPPER_GPIO_PIN_D1_STBY_RST, 
                         OISTEPPER_GPIO_PIN_D2_STBY_RST},

        .pwm_pin_stck = OISTEPPER_PWM_PIN_STCK,

        .pwm_timer = OISTEPPER_PWM_TIMER,
        .pwm_mode = OISTEPPER_PWM_MODE,
        .pwm_channel = OISTEPPER_PWM_CHANNEL,
    };

    /* Configure Device */
    #ifdef CONFIG_L6470
    L6470_DeviceConfig(&device_conf);
    L6470_SetNbDevices(OISTEPPER_NUMBER_OF_DEVICES);
    ESP_LOGI(OI_STEPPER_TAG, "Number of L6470 device(s): %d", L6470_GetNbDevices());
    #else
    Powerstep01_DeviceConfig(&device_conf);
    Powerstep01_SetNbDevices(OISTEPPER_NUMBER_OF_DEVICES);
    ESP_LOGI(OI_STEPPER_TAG, "Number of powerstep01 device(s): %d", Powerstep01_GetNbDevices());
    #endif

    /* Configure motors */
    #ifdef CONFIG_OI_STEPPER
    _type = OI_STEPPER;
    #ifdef CONFIG_L6470
    L6470_InitMotor(DEVICE1); // Init device 1
    L6470_SetSwitchLevel(DEVICE1, HIGH);
    L6470_InitMotor(DEVICE2); // Init device 2
    L6470_SetSwitchLevel(DEVICE2, HIGH);
    #else
    Powerstep01_InitDevice(DEVICE1);
    Powerstep01_InitDevice(DEVICE2);
    Powerstep01_InitNVSParameters(DEVICE1);
    Powerstep01_InitNVSParameters(DEVICE2);
    Powerstep01_SetSwitchLevel(DEVICE1, HIGH);
    Powerstep01_SetSwitchLevel(DEVICE2, HIGH);
    #endif
    #else
    _type = OI_STEPPERVE;
    Powerstep01_InitMotor(DEVICE1); // Init device 1
    Powerstep01_SetSwitchLevel(DEVICE1, HIGH);
    #endif

    /* Check configuration */
    #ifdef CONFIG_L6470
    if (L6470_ReadId() != OISTEPPER_NUMBER_OF_DEVICES) {
        ESP_LOGE(OI_STEPPER_TAG, "Incorrect number of powerstep01 instance");  
    }
    #else
    if (Powerstep01_ReadId() != OISTEPPER_NUMBER_OF_DEVICES) {
        ESP_LOGE(OI_STEPPER_TAG, "Incorrect number of powerstep01 instance");  
    }
    #endif

    /* create task and event group to manage interrupts */
    _eventGroupHandle = xEventGroupCreate();
    xTaskCreate(_handleEvent, "handle events", 2048, this, 5, NULL);
}

/* Private functions */

void OIStepper::_handleEvent(void *pvParameters)
{
    OIStepper* stepper = (OIStepper*)pvParameters;
    EventBits_t eventBits;
    uint8_t index = 0xFF;
    assert(stepper != NULL);

    while(1)
    {
        eventBits = xEventGroupWaitBits(_eventGroupHandle, 
            (BUSY_INTERRUPT_EVENT | ERROR_HANDLER_EVENT | FLAG_INTERRUPT_EVENT | 
            ETOR1_INTERRUPT_EVENT | ETOR2_INTERRUPT_EVENT | ETOR3_INTERRUPT_EVENT | ETOR4_INTERRUPT_EVENT), 
            pdTRUE, pdFALSE, portMAX_DELAY
        );

        index = 0xFF;
        
        if (eventBits & BUSY_INTERRUPT_EVENT) {
            stepper->sendMessage(OIMessage(CMD_BUSY_INTERRUPT, stepper->getId()));
        }
        else if (eventBits & ERROR_HANDLER_EVENT) {
            stepper->sendMessage(OIMessage(CMD_ERROR_HANDLER, stepper->getId()));
        }
        else if (eventBits & FLAG_INTERRUPT_EVENT) {
            stepper->sendMessage(OIMessage(CMD_FLAG_INTERRUPT, stepper->getId()));
        }
        else if (eventBits & ETOR1_INTERRUPT_EVENT) {
            index = static_cast<uint8_t>(ETOR1);
        }
        else if (eventBits & ETOR2_INTERRUPT_EVENT) {
            index = static_cast<uint8_t>(ETOR2);
        }
        else if (eventBits & ETOR3_INTERRUPT_EVENT) {
            index = static_cast<uint8_t>(ETOR3);
        }
        else if (eventBits & ETOR4_INTERRUPT_EVENT) {
            index = static_cast<uint8_t>(ETOR4);
        }

        if (index != 0xFF)
        {
            if(_limitSwitchToMotor[index] != -1)
            {
                #ifdef CONFIG_L6470
                L6470_SetSwitchLevel(_limitSwitchToMotor[index], gpio_get_level(_etor[index])?LOW:HIGH);
                #else
                Powerstep01_SetSwitchLevel(_limitSwitchToMotor[index], gpio_get_level(_etor[index])?LOW:HIGH); // SW logic is inverted
                #endif
            }
            if(_limitSwitchToNotify[index])
            {
                stepper->sendMessage(OIMessage(CMD_ETOR_INTERRUPT, stepper->getId(), static_cast<uint16_t>(index)));
            }
        }
    }
}

void OIStepper::attachLimitSwitch(Etor_t etor, uint8_t deviceId, bool notify) {
    if (_limitSwitchToMotor[static_cast<uint8_t>(etor)] == -1)
    {   
        _limitSwitchToMotor[static_cast<uint8_t>(etor)] = deviceId;
        _limitSwitchToNotify[static_cast<uint8_t>(etor)] = notify;
        switch (etor) {
            case ETOR1 : 
                attachEtorInterrupt(etor, [](void) {
                    xEventGroupSetBits(_eventGroupHandle, ETOR1_INTERRUPT_EVENT);
                });
                break;
            case ETOR2 : 
                attachEtorInterrupt(etor, [](void) {
                    xEventGroupSetBits(_eventGroupHandle, ETOR2_INTERRUPT_EVENT);
                });
                break;
            case ETOR3 : 
                attachEtorInterrupt(etor, [](void) {
                    xEventGroupSetBits(_eventGroupHandle, ETOR3_INTERRUPT_EVENT);
                });
                break;
            case ETOR4 : 
                attachEtorInterrupt(etor, [](void) {
                    xEventGroupSetBits(_eventGroupHandle, ETOR4_INTERRUPT_EVENT);
                });
                break;
            default:
                break;
        }
    }
}

void OIStepper::detachLimitSwitch(Etor_t etor) 
{
    if (_limitSwitchToMotor[static_cast<uint8_t>(etor)] != -1)
    {
        L6470_SetSwitchLevel(_limitSwitchToMotor[etor], HIGH);
        _limitSwitchToMotor[static_cast<uint8_t>(etor)] = -1;
        _limitSwitchToNotify[static_cast<uint8_t>(etor)] = false;
        detachEtorInterrupt(etor);
    }
}

void OIStepper::attachFunctions(void)
{
    /* add callback functions */
    OIModule::attachFunctions();

    FUNCTION.add(OIMessage(CMD_GET_ETOR_LEVEL, _id), [this](OIMessage msg) -> uint32_t { 
        return getEtorLevel(static_cast<Etor_t>(msg.getConf()));
    });

    FUNCTION.add(OIMessage(CMD_ATTACH_LIMIT_SWITCH, _id), [this](OIMessage msg) -> uint32_t { 
        _masterId = msg.getId();
        attachLimitSwitch(static_cast<Etor_t>(msg.getConf(1)), msg.getConf(0), static_cast<bool>(msg.getData()));
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_DETACH_LIMIT_SWITCH, _id), [this](OIMessage msg) -> uint32_t { 
        _masterId = msg.getId();
        detachLimitSwitch(static_cast<Etor_t>(msg.getConf()));
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_ATTACH_BUSY_INTERRUPT, _id), [this](OIMessage msg) -> uint32_t { 
        _masterId = msg.getId();
        attachBusyInterrupt([](void) {
            xEventGroupSetBits(_eventGroupHandle, BUSY_INTERRUPT_EVENT);
        }); 
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_ATTACH_ERROR_HANDLER, _id), [this](OIMessage msg) -> uint32_t { 
        attachBusyInterrupt([](void) { 
            xEventGroupSetBits(_eventGroupHandle, ERROR_HANDLER_EVENT);
            /** @todo add queue to send error */
        }); 
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_ATTACH_FLAG_INTERRUPT, _id), [this](OIMessage msg) -> uint32_t { 
        _masterId = msg.getId();
        attachFlagInterrupt([](void) { 
            xEventGroupSetBits(_eventGroupHandle, FLAG_INTERRUPT_EVENT);
        }); 
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_CHECK_BUSY_HW, _id), [this](OIMessage msg) -> uint32_t { 
        return checkBusyHw();
    });

    FUNCTION.add(OIMessage(CMD_CHECK_STATUS_HW, _id), [this](OIMessage msg) -> uint32_t { 
        return checkStatusHw();
    });

    FUNCTION.add(OIMessage(CMD_GET_STATUS, _id), [this](OIMessage msg) -> uint32_t { 
        return cmdGetStatus(static_cast<uint8_t>(msg.getConf()));
    });

    FUNCTION.add(OIMessage(CMD_GO_HOME, _id), [this](OIMessage msg) -> uint32_t { 
        cmdGoHome(static_cast<uint8_t>(msg.getConf()));
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_GO_MARK, _id), [this](OIMessage msg) -> uint32_t { 
        cmdGoMark(static_cast<uint8_t>(msg.getConf()));
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_GO_TO, _id), [this](OIMessage msg) -> uint32_t { 
        cmdGoTo(static_cast<uint8_t>(msg.getConf()), 
            msg.getData());
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_GO_TO_DIR, _id), [this](OIMessage msg) -> uint32_t { 
        cmdGoToDir(static_cast<uint8_t>(msg.getConf()), 
            static_cast<motorDir_t>((msg.getConf() & 0xFF00) >> 8), 
            msg.getData());
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_GO_UNTIL, _id), [this](OIMessage msg) -> uint32_t { 
        cmdGoUntil(static_cast<uint8_t>(msg.getConf()), 
            static_cast<motorAction_t>((msg.getConf() & 0xF000) >> 12), 
            static_cast<motorDir_t>((msg.getConf() & 0x0F00) >> 8), 
            msg.getData());
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_HARD_HIZ, _id), [this](OIMessage msg) -> uint32_t { 
        cmdHardHiZ(static_cast<uint8_t>(msg.getConf()));
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_HARD_STOP, _id), [this](OIMessage msg) -> uint32_t { 
        cmdHardStop(static_cast<uint8_t>(msg.getConf()));
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_MOVE, _id), [this](OIMessage msg) -> uint32_t { 
        cmdMove(static_cast<uint8_t>(msg.getConf()), 
            static_cast<motorDir_t>((msg.getConf() & 0xFF00) >> 8), 
            msg.getData());
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_RELEASE_SW, _id), [this](OIMessage msg) -> uint32_t { 
        cmdReleaseSw(static_cast<uint8_t>(msg.getConf()), 
            static_cast<motorAction_t>((msg.getConf() & 0xF000) >> 12), 
            static_cast<motorDir_t>((msg.getConf() & 0x0F00) >> 8));
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_RESET_DEVICE, _id), [this](OIMessage msg) -> uint32_t { 
        cmdResetDevice(static_cast<uint8_t>(msg.getConf()));
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_RESET_POS, _id), [this](OIMessage msg) -> uint32_t { 
        cmdResetPos(static_cast<uint8_t>(msg.getConf()));
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_RUN, _id), [this](OIMessage msg) -> uint32_t { 
        cmdRun(static_cast<uint8_t>(msg.getConf()), 
            static_cast<motorDir_t>((msg.getConf() & 0xFF00) >> 8), 
            msg.getData());
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_SOFT_HIZ, _id), [this](OIMessage msg) -> uint32_t { 
        cmdSoftHiZ(static_cast<uint8_t>(msg.getConf()));
        return 0;
    });


    FUNCTION.add(OIMessage(CMD_SOFT_STOP, _id), [this](OIMessage msg) -> uint32_t { 
        cmdSoftStop(static_cast<uint8_t>(msg.getConf()));
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_STEP_CLOCK, _id), [this](OIMessage msg) -> uint32_t { 
        cmdStepClock(static_cast<uint8_t>(msg.getConf()), 
            static_cast<motorDir_t>((msg.getConf() & 0xFF00) >> 8));
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_FETCH_AND_CLEAR_ALL_STATUS, _id), [this](OIMessage msg) -> uint32_t {
        fetchAndClearAllStatus();
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_GET_FETCHED_STATUS, _id), [this](OIMessage msg) -> uint32_t { 
        return getFetchedStatus(static_cast<uint8_t>(msg.getConf()));
    });

    FUNCTION.add(OIMessage(CMD_GET_MARK, _id), [this](OIMessage msg) -> uint32_t { 
        return getMark(static_cast<uint8_t>(msg.getConf()));
    });

    FUNCTION.add(OIMessage(CMD_GET_POSITION, _id), [this](OIMessage msg) -> uint32_t { 
        return getPosition(static_cast<uint8_t>(msg.getConf()));
    });

    FUNCTION.add(OIMessage(CMD_IS_DEVICE_BUSY, _id), [this](OIMessage msg) -> uint32_t { 
        return static_cast<uint32_t>(isDeviceBusy(static_cast<uint8_t>(msg.getConf())));
    });

    FUNCTION.add(OIMessage(CMD_QUEUE_COMMANDS, _id), [this](OIMessage msg) -> uint32_t { 
        queueCommands(static_cast<uint8_t>(msg.getConf()), 
            static_cast<uint8_t>((msg.getConf() & 0xFF00) >> 8), 
            msg.getData());
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_READ_STATUS_REGISTER, _id), [this](OIMessage msg) -> uint32_t { 
        return readStatusRegister(static_cast<uint8_t>(msg.getConf()));
    });

    FUNCTION.add(OIMessage(CMD_RELEASE_RESET, _id), [this](OIMessage msg) -> uint32_t { 
        releaseReset(static_cast<uint8_t>(msg.getConf()));
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_RESET, _id), [this](OIMessage msg) -> uint32_t { 
        reset(static_cast<uint8_t>(msg.getConf()));
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_SELECT_STEP_MODE, _id), [this](OIMessage msg) -> uint32_t { 
        return static_cast<uint32_t>(selectStepMode(static_cast<uint8_t>(msg.getConf()), 
            static_cast<motorStepMode_t>((msg.getConf() & 0xFF00) >> 8)));
    });

    FUNCTION.add(OIMessage(CMD_SEND_QUEUED_COMMANDS, _id), [this](OIMessage msg) -> uint32_t { 
        sendQueuedCommands();
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_SET_HOME, _id), [this](OIMessage msg) -> uint32_t { 
        setHome(static_cast<uint8_t>(msg.getConf()),
            msg.getData());
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_SET_MARK, _id), [this](OIMessage msg) -> uint32_t { 
        setMark(static_cast<uint8_t>(msg.getConf()),
            msg.getData());
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_START_STEP_CLOCK, _id), [this](OIMessage msg) -> uint32_t { 
        startStepClock(msg.getConf());
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_STOP_STEP_CLOCK, _id), [this](OIMessage msg) -> uint32_t { 
        stopStepClock();
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_SET_PARAM, _id), [this](OIMessage msg) -> uint32_t { 
        cmdSetParam(static_cast<uint8_t>(msg.getConf()), 
            ((msg.getConf() & 0xFF00) >> 8), 
            msg.getData());
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_GET_PARAM, _id), [this](OIMessage msg) -> uint32_t { 
        return cmdGetParam(static_cast<uint8_t>(msg.getConf()), 
            ((msg.getConf() & 0xFF00) >> 8));
    });

    FUNCTION.add(OIMessage(CMD_SET_ANALOG_VALUE, _id), [this](OIMessage msg) -> uint32_t {
        uint32_t value = msg.getData();
        return static_cast<uint32_t>(setAnalogValue(static_cast<uint8_t>(msg.getConf()), 
            ((msg.getConf() & 0xFF00) >> 8),
            reinterpret_cast<float &>(value)));
    });

    FUNCTION.add(OIMessage(CMD_GET_ANALOG_VALUE, _id), [this](OIMessage msg) -> uint32_t { 
        float value = getAnalogValue(static_cast<uint8_t>(msg.getConf()), 
            ((msg.getConf() & 0xFF00) >> 8));
        return reinterpret_cast<uint32_t &>(value);
    });
}

#endif /* CONFIG_OI_STEPPER */