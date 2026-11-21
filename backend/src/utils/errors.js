export class AppError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code}}
export function asyncHandler(fn){return(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next)}
export function errorHandler(err,req,res,next){console.error(err);res.status(err.status||500).json({error:{code:err.code||'INTERNAL_ERROR',message:err.status?err.message:'Internal server error',requestId:req.id}})}
