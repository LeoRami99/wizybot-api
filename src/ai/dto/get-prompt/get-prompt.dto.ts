import * as Joi from 'joi';

export const getPromptSchema = Joi.object({
    prompt: Joi.string().min(10).max(512).required(),
});

export type populationTypes = {
    ok?: boolean,
    error?: string,
    city: string,
    population: number
}
export type weatherTypes = {
    ok?: boolean,
    city: string,
    description: string,
    temperature: number,
    humidity: number,
    windSpeed: number,
}

export type weatherTypesError = {
    ok?: false,
    error: string,
}

export type weatherResponseType = weatherTypes | weatherTypesError;