export class HttpError extends Error {
  constructor(status, message, code = 'REQUEST_ERROR') {super(message);this.status=status;this.code=code;}
}
export const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
export const assert = (condition, status, message, code) => {if (!condition) throw new HttpError(status,message,code);};
export function errorHandler(err, req, res, next) {
  if(res.headersSent) return next(err);
  if(err?.code === '23505') return res.status(409).json({error:'A record with those details already exists.',code:'DUPLICATE'});
  if(err?.code === '23503') return res.status(400).json({error:'Referenced record does not exist.',code:'INVALID_REFERENCE'});
  if(err?.name === 'ZodError') return res.status(400).json({error:'Invalid request data', code:'VALIDATION_ERROR', details:err.issues.map(i=>({path:i.path.join('.'),message:i.message}))});
  if(err instanceof HttpError) return res.status(err.status).json({error:err.message,code:err.code});
  console.error('Unhandled request error:',err);
  res.status(500).json({error:'Internal server error',code:'INTERNAL_ERROR'});
}
