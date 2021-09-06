/**
 * Copyright (C) OpenIndus, Inc - All Rights Reserved
 *
 * This file is part of OpenIndus Library.
 *
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * 
 * @file OIModule.h
 * @brief  functions for OIModules
 *
 * For more information on OpenIndus:
 * @see https://openindus.com
 */

#pragma once

#include <stdint.h>
#include <functional>
#include <map>

#include "ledonewire/ledonewire.h"

#include "OIBus.h"
#include "OIFunction.h"
#include "OIType.h"

/* NVS Memory */
#define OI_NVS_PARTITION (const char*)"nvs_oi"
#define OI_NVM_NAMESPACE (const char*)"namespace_oi"
#define OI_NVM_KEY_ID    (const char*)"id"

/* Board Type */
#define OI_CORE          0
#define OI_DISCRETE      1
#define OI_DISCRETEVE    2
#define OI_STEPPER       3
#define OI_STEPPERVE     4
#define OI_MIXED         5
#define OI_RELAY_LP      6
#define OI_RELAY_HP      7

#ifdef CONFIG_IDF_TARGET_ESP32S2
#define OIMODULE_PIN_LED GPIO_NUM_3
#else
#define OIMODULE_PIN_LED GPIO_NUM_21
#endif


class OIModule
{
public:

    OIModule() {
        _id = UNDEFINED_ID;
    }

    virtual void init(void);
    virtual void deinit(void);

    /******************* OIBus commands *******************/

    inline void sendMessage(OIMessage const& msg) const {
        TWAI_S.sendMessage(msg, _masterId);
    }
    /******************************************************/

    /**
     * @brief Empty function returning 0xAA
     * 
     */
    int ping() const;

    /**
     * @brief Function used to get the type of a board
     * 
     */
    int getType() const;

    /**
     * @brief Reset the current board
     * 
     */
    void restart(void) const;

    /**
     * @brief Turn the led on with the given color
     * 
     * @param[in] LedColor_t color
     *
     */
    void ledOn(LedColor_t color) const;

    /**
     * @brief Turn the led off
     * 
     */
    void ledOff(void) const;

    /**
     * @brief Blink the led with given color and period
     * 
     * @param[in] LedColor_t color
     * @param[in] uint32_t period un millisecond
     */
    void ledBlink(LedColor_t color, uint32_t period) const;

    /**
     * @brief Get the internal temp of the mcu
     * 
     * @return float temperature
     */
    float getInternalTemp(void) const;

    /**
     * @brief Get the Id object
     * 
     * @return uint8_t id
     */
    inline uint8_t getId(void) {
        return _id;
    }

    /**
     * @brief Set the Id object
     * 
     * @param id 
     */
    inline void setId(uint8_t id) {
        _id = id;
    }

    /**
     * @brief Get the Id stored in NVS memory
     * 
     * @return uint8_t id
     */
    uint8_t getHardwareId(void);

    /**
     * @brief Set the Id stored in NVS memory
     * 
     * @param id 
     */
    void setHardwareId(uint8_t id);

    /**
     * @brief add callback functions
     * 
     */
    virtual void attachFunctions(void);

protected:

    /**
     * @brief Module id
     * 
     */
    uint8_t _id;

    /**
     * @brief Master id
     * 
     */
    static uint8_t _masterId;

    /** 
     * @brief board type
     *
     */
    int _type;

    /** 
     * @brief ETOR Interrupt current mode
     *
     */
    std::map<Etor_t, InterruptMode_t> _etorCurrentMode;

private:

    static bool _tempSensorInitialized;
};


class OISubModule
{
public:

    OISubModule(uint8_t id) {
        _destId = id;
    }

    /******************* OIBus commands *******************/

    inline void setMessage(OIMessage const& msg) const {
        RS_P.setMessage(msg, _destId);
    }

    inline uint32_t getMessage(OIMessage const& msg) const {
        return RS_P.getMessage(msg, _destId);
    }

    inline void sendMessage(OIMessage const& msg) const {
        RS_P.sendMessage(msg, _destId);
    }
    /******************************************************/

    /**
     * @brief Empty function used to ping a board on the rail
     * 
     */
    inline int ping() const {
        return getMessage(OIMessage(CMD_PING, _senderId)); 
    }

    /**
     * @brief Get the type of the board
     * 
     * @return int type
     */
    inline int getType(void) const {
        int type;
        type = getMessage(OIMessage(CMD_GET_TYPE, _senderId));
        return type;
    }

    /**
     * @brief Reset the current board
     * 
     */
    inline void restart() const {
        setMessage(OIMessage(CMD_RESTART, _senderId));
    }

    /**
     * @brief Turn the led on with the given color
     * 
     * @param[in] LedColor_t color
     *
     */
    inline void ledOn(LedColor_t color) const {
        setMessage(OIMessage(CMD_LED, _senderId, (LED_ACTION_ON << 8) | color));
    }

    /**
     * @brief Turn the led off
     * 
     */
    inline void ledOff() const {
        setMessage(OIMessage(CMD_LED, _senderId, (LED_ACTION_OFF << 8)));
    }

    /**
     * @brief Blink the led with given color and period
     * 
     * @param[in] LedColor_t color
     * @param[in] uint32_t period un millisecond
     */
    inline void ledBlink(LedColor_t color, uint32_t period) const {
        setMessage(OIMessage(CMD_LED, _senderId, (LED_ACTION_BLINK << 8) | color, period));
    }

    /**
     * @brief Get the internal temp of the mcu
     * 
     * @return float temperature
     */
    inline float getInternalTemp(void) const {
        float temp;
        uint32_t tempReturn;
        tempReturn = getMessage(OIMessage(CMD_INTERNAL_TEMP, _senderId));
        memcpy(&temp, &tempReturn, sizeof(float));
        return temp;
    }

    /**
     * @brief Get the Sender Id object
     * 
     * @return uint8_t 
     */
    inline uint8_t getSenderId(void) {
        return _senderId;
    }

    /**
     * @brief Set the Sender Id object
     * 
     * @param id 
     */
    inline void setSenderId(uint8_t id) {
        _senderId = id;
    }

    /**
     * @brief Get the Dest Id object
     * 
     * @return uint8_t 
     */
    inline uint8_t getDestId(void) {
        return _destId;
    }

    /**
     * @brief Set the Dest Id object
     * 
     * @param id 
     */
    inline void setDestId(uint8_t id) { 
        _destId = id;
    }

protected:

    uint8_t _senderId;
    uint8_t _destId;
};