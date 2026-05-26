const pool = require('../config/db');

//Link order to address
exports.addOrderAddress  = async (req,res)=>{
    try{
        const{order_id,address_id} = req.body;
        await pool.query(
            'INSERT INTO order_addresses (order_id,address_id) VALUES (?,?)',
            [order_id, address_id]
        );
        res.status(201).json({message: 'Address linked to order successfully'});
    }catch(error){
        console.error(error);
        res.status(500).json({error:'Error linking address to order'});
    }
};


//Get All addresses for an order
exports.getAddressesForOrder = async(req,res)=>{
    try{
        const{orderId} = req.params;
        const[rows] = await pool.query(
            `SELECT a.*
            FROM order_addresses oa
            JOIN addresses a ON oa.address_id = a.address_id
            WHERE oa.order_id = ?`,
            [orderId]
        );
        res.status(200).json(rows);
    }catch(error){
        console.error(error);
        res.status(500).json({error:'Error fetching order addresses'});
    }
}

//UNLINK an address from an order
exports.removeOrderAddress = async (req,res)=>{
    try{
        const {orderId,addressId} = req.params;
        const [result] = await pool.query(
            'DELETE FROM order_addresses WHERE order_id =? AND address_id = ?',
            [orderId,addressId]
        );
        if (result.affectedRows ===0){
            return res.status(404).json({error:'Order-address link not found'});

        }
        res.status(200).json({message:'Addresses unlinked from order successfully'});
    }catch(error){
        console.error(error);
        res.status(500).json({error:'Error removing order address'});
    }
};
