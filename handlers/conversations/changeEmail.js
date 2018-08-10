const Firestore = require('../firestore_handler')
const ActionHandler = require('../action_handler')

const steps = ['newEmail', 'code']

class ChangeEmailConvo {
    constructor(commandConvo) {
        this.commandConvo = commandConvo
        this.firestore = new Firestore()
    }

    currentStep() {
        for (let i = 0; i < steps.length; i++) {
            let step = steps[i]
            if (!this.commandConvo.data()[step]) return step
        }
    }

    initialMessage() {
        return `No problem; let's get your email changed. What would you like to change it to?`
    }

    async complete(value) {
        let { telegramID, newEmail } = this.commandConvo.data()
        try {
            await new ActionHandler().changeEmail(telegramID, newEmail, value)
            await this.firestore.clearCommandPartial(telegramID)
            return {
                message:
                    `Great! Your email address has been updated to ${newEmail}. Please remember ` +
                    `to clear this conversation to remove sensitive information.`,
                keyboard: 'p1'
            }
        } catch (e) {
            return e.toString()
        }
    }

    async afterMessageForStep(step, value) {
        switch (step) {
            case steps[0]:
                let emailExists = false
                try {
                    await this.firestore.getUserByEmail(value)
                    emailExists = true
                } catch (e) {} //ignore this, it just means the email address does not exist, which is what we want

                if (emailExists) {
                    await this.firestore.unsetCommandPartial(
                        this.commandConvo.id,
                        step
                    )
                    return {
                        message: `Sorry, but that email address is already registered. Please use a different one.`,
                        keyboard: [{ text: 'Cancel', callback_data: '/start' }]
                    }
                }

                let result = await new ActionHandler().request2FA(
                    this.commandConvo.data().telegramID
                )
                if (result)
                    return {
                        message: `Please enter the two factor authentication code you received via SMS.`,
                        keyboard: [
                            {
                                text: 'New Code',
                                callback_data: '/requestNew2FACode newEmail'
                            },
                            { text: 'Cancel', callback_data: '/help' }
                        ]
                    }
                else {
                    await this.firestore.unsetCommandPartial(
                        this.commandConvo.id,
                        step
                    )
                    return {
                        message:
                            'Sorry, I had an issue with your request. Please try again.',
                        keyboard: [{ text: 'Cancel', callback_data: '/help' }]
                    }
                }

            case steps[1]:
                let checkCode = await new ActionHandler().check2FA(
                    this.commandConvo.data().telegramID,
                    value
                )

                if (checkCode)
                    return {
                        message: `Please reply with your password if you want to change your email to ${
                            this.commandConvo.data().newEmail
                        }.`,
                        keyboard: [{ text: 'Cancel', callback_data: '/help' }]
                    }
                else {
                    await this.firestore.unsetCommandPartial(
                        this.commandConvo.id,
                        step
                    )
                    return {
                        message:
                            'You entered an invalid code, or the code we sent you has expired. Please try again.',
                        keyboard: [
                            {
                                text: 'New Code',
                                callback_data: '/requestNew2FACode newEmail'
                            },
                            { text: 'Cancel', callback_data: '/help' }
                        ]
                    }
                }

            default:
                return 'Not sure what to do here. Click "Cancel" to cancel the current command.'
        }
    }

    async setCurrentStep(value) {
        let currentStep = this.currentStep()
        if (currentStep) {
            return await this.setStep(currentStep, value)
        } else {
            return await this.complete(value)
        }
    }

    async setStep(step, value) {
        let validated = await this.validateStep(step, value)
        if (!validated) throw `Please enter a valid ${step}`
        let params = {}

        params[step] = value
        try {
            await this.firestore.setCommandPartial(this.commandConvo.id, params)
            return this.afterMessageForStep(step, value)
        } catch (e) {
            throw `An error occurred, please try sending "${step}" again.`
        }
    }

    async validateStep(step, value) {
        switch (step) {
            case steps[0]:
                return new ActionHandler().isEmail(value)
            case steps[1]:
                return true
            default:
                return false
        }
    }
}

module.exports = ChangeEmailConvo
