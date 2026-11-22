import {Router} from 'express'; import {z} from 'zod'; import {asyncHandler} from '../utils/errors.js'; import * as s from '../services/product.service.js';
const r=Router();r.get('/',asyncHandler(async(req,res)=>res.json(await s.listProducts(req.query))));r.get('/:id',asyncHandler(async(req,res)=>res.json(await s.getProduct(req.params.id))));export default r;
