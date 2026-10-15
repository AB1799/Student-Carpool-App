import { z } from 'zod';
export const latitude = z.number().finite().min(-90).max(90);
export const longitude = z.number().finite().min(-180).max(180);
export const pointSchema = z.object({lat:latitude,lng:longitude}).strict();
export const locationSchema = z.object({label:z.string().trim().min(2).max(200), lat:latitude, lng:longitude}).strict();
export const uuid = z.string().uuid();
export const departureSchema = z.string().datetime({offset:true});
export const safeInt = (min,max) => z.coerce.number().int().min(min).max(max);
export const uuidParam = req => uuid.parse(req.params.id);
