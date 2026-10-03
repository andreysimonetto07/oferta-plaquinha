import {readiness} from '../lib/config.js';
import {begin} from '../lib/security.js';
export default function handler(req,res){if(!begin(req,res,'GET'))return;res.status(200).json({ready:readiness(),payment_method:'pix',seller:process.env.SELLER_DETAILS||null});}
