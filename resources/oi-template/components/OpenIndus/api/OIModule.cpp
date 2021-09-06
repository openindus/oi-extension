/**
 * Copyright (C) OpenIndus, Inc - All Rights Reserved
 *
 * This file is part of OpenIndus Library.
 *
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * 
 * @file OIModule.cpp
 * @brief Generic functions for OIModule
 *
 * For more information on OpenIndus:
 * @see https://openindus.com
 */

#include "OIModule.h"

#include "nvs_flash.h"
#include "nvs.h"

// temp_sensor.h works only on esp32s2
#ifndef CONFIG_OI_CORE
#include "driver/temp_sensor.h"
#endif

static const char OI_MODULE_TAG[] = "OIModule";

uint8_t OIModule::_masterId = UNDEFINED_ID;
bool OIModule::_tempSensorInitialized;

void OIModule::init()
{
    _tempSensorInitialized = false;

    ledonewire_install(OIMODULE_PIN_LED);
    ledonewire_blink(LED_BLUE, 1000);
}

void OIModule::deinit(void)
{
    ledonewire_off();
    ledonewire_remove();
}

int OIModule::ping() const
{
    return 0xAA;
}

int OIModule::getType() const
{
    return _type;
}

void OIModule::restart() const
{
    ESP_LOGV(OI_MODULE_TAG, "restart now");
    vTaskDelay(pdMS_TO_TICKS(50)); // wait for message to send
    esp_restart();
}

void OIModule::ledOn(LedColor_t color) const
{
    ledonewire_on(color);
}

void OIModule::ledOff() const
{
    ledonewire_off();
}

void OIModule::ledBlink(LedColor_t color, uint32_t period) const
{
    ledonewire_blink(color, period);
}

float OIModule::getInternalTemp(void) const
{
    #if defined CONFIG_OI_CORE

        ESP_LOGW(OI_MODULE_TAG, "Internal temperature sensor not implemented on OICore");

        return 0;

    #else

        float tsens_out;

        if (_tempSensorInitialized == false)
        {
            ESP_LOGI(OI_MODULE_TAG, "Initializing Temperature sensor");
            temp_sensor_config_t temp_sensor = TSENS_CONFIG_DEFAULT();
            temp_sensor_get_config(&temp_sensor);
            temp_sensor.dac_offset = TSENS_DAC_DEFAULT; // DEFAULT: range:-10℃ ~  80℃, error < 1℃.
            temp_sensor_set_config(temp_sensor);
            temp_sensor_start();
            _tempSensorInitialized = true;
        }

        temp_sensor_read_celsius(&tsens_out);

        return tsens_out;

    #endif
}

uint8_t OIModule::getHardwareId(void)
{
    uint8_t nvsId = UNDEFINED_ID;

    // Initialize NVS
    esp_err_t err = nvs_flash_init_partition(OI_NVS_PARTITION);
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        // NVS partition was truncated and needs to be erased
        // Retry nvs_flash_init
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);

    // Open
    ESP_LOGV(OI_MODULE_TAG, "Opening Non-Volatile Storage (NVS) handle...");
    nvs_handle_t readId;
    err = nvs_open_from_partition(OI_NVS_PARTITION, OI_NVM_NAMESPACE, NVS_READWRITE, &readId);
    if (err != ESP_OK) {
        ESP_LOGE(OI_MODULE_TAG, "Error (%s) opening NVS handle!", esp_err_to_name(err));
    } else {
        // Read Id
        err = nvs_get_u8(readId, OI_NVM_KEY_ID, &nvsId);
        switch (err) {
            case ESP_OK:
                ESP_LOGV(OI_MODULE_TAG, "Hardware id is %d", nvsId);
                break;
            case ESP_ERR_NVS_NOT_FOUND:
                ESP_LOGW(OI_MODULE_TAG,"Hardware was not initialized yet : default value (%d)", nvsId);
                break;
            default :
                ESP_LOGE(OI_MODULE_TAG,"Error reading nvs memory");
        }       

        // Close
        nvs_close(readId);
    }   

    return nvsId;
}

void OIModule::setHardwareId(uint8_t id)
{
    // Initialize NVS
    esp_err_t err = nvs_flash_init_partition(OI_NVS_PARTITION);
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        // NVS partition was truncated and needs to be erased
        // Retry nvs_flash_init
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);

    // Open
    ESP_LOGV(OI_MODULE_TAG, "Opening Non-Volatile Storage (NVS) handle...");
    nvs_handle_t readId;
    err = nvs_open_from_partition(OI_NVS_PARTITION, OI_NVM_NAMESPACE, NVS_READWRITE, &readId);
    if (err != ESP_OK) {
        ESP_LOGE(OI_MODULE_TAG, "Error (%s) opening NVS handle!", esp_err_to_name(err));
    } else {
        // Write
        ESP_LOGV(OI_MODULE_TAG, "Update Id in NVS Memory : %d", id);

        err = nvs_set_u8(readId, OI_NVM_KEY_ID, id);
        if (err != ESP_OK)
        {
            ESP_LOGE(OI_MODULE_TAG, "Fail to write id in memory");
        }
        err = nvs_commit(readId);

        if (err != ESP_OK)
        {
            ESP_LOGE(OI_MODULE_TAG, "Fail commit nvs memory");
        }

        // Close
        nvs_close(readId);
    }
    // Update OIModule _id attribute
    _id = id;
}

/************************************************************************************************************/
/*----------------------------------------- BUS CONTROL FUNCTIONS ------------------------------------------*/
/************************************************************************************************************/

void OIModule::attachFunctions(void)
{
    ESP_LOGI(OI_MODULE_TAG, "adding module functions");

    FUNCTION.add(OIMessage(CMD_PING, _id), [this](OIMessage msg) -> uint32_t {
        return ping();
    });

    FUNCTION.add(OIMessage(CMD_GET_TYPE, _id), [this](OIMessage msg) -> uint32_t {
        return getType();
    });

    FUNCTION.add(OIMessage(CMD_GET_TYPE_ALL, _id), [this](OIMessage msg) -> uint32_t {
        int type = getType();
        TWAI_S.sendMessage(OIMessage(CMD_GET_TYPE_ALL, getId(), 0, type), msg.getId());
        return type;
    });
    
    FUNCTION.add(OIMessage(CMD_RESTART, _id), [this](OIMessage msg) -> uint32_t {
        restart();
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_LED, _id), [this](OIMessage msg) -> uint32_t {
        if (msg.getConf(1) == LED_ACTION_ON)
        {
            ledOn((LedColor_t)msg.getConf(0));
        }
        else if (msg.getConf(1) == LED_ACTION_OFF)
        {
            ledOff();
        }
        else if (msg.getConf(1) == LED_ACTION_BLINK)
        {
            ledBlink((LedColor_t)msg.getConf(0), msg.getData()); 
        }
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_INTERNAL_TEMP, _id), [this](OIMessage msg) -> uint32_t {
        float temp;
        temp = getInternalTemp();
        uint32_t tempReturn = 0;
        memcpy(&tempReturn, &temp, sizeof(float));
        return tempReturn;
    });
}