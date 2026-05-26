const pool = require('../config/db');

//CRUD Operations for Addresses
//CREATE address
exports.createAddress = async (req, res) => {
    try {
      const { customer_id, street, city, state, zip_code, country, is_default } = req.body;
      const [result] = await pool.query(
        `INSERT INTO addresses 
         (customer_id, street, city, state, zip_code, country, is_default) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [customer_id, street, city, state, zip_code, country, is_default || false]
      );
      res.status(201).json({ address_id: result.insertId, customer_id, street, city });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error creating address' });
    }
  };

// GET all addresses
exports.getAllAddresses = async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM addresses');
      res.status(200).json(rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error fetching addresses' });
    }
  };

//Get addresses by Customer
exports.getAddressesByCustomer = async (req,res)=>{
    try{
        const{customerId} = req.params;
        const[rows] = await pool.query('SELECT * FROM addresses WHERE customer_id = ?', [customerId]);
        res.status(200).json(rows);
    }catch (error){
        console.error(error);
        res.status(500).json({error:'Error fetching addresses'});
    }
};

//Update address
exports.updateAddress = async (req,res)=>{
    try{
        const {id} = req.params;
        const {street, city, state, zip_code, country,is_default} = req.body;
        const [result] = await pool.query(
            `UPDATE addresses SET street = ?, city = ?, state=?, zip_code = ?, country =?, is_default =?
            WHERE address_id = ?`,
            [street, city,state,zip_code,country,is_default,id]
        );
        if (result.affectedRows ===0){
            return res.status(404).json({error :'Address Not Found'});
        }
        res.status(200).json({message: 'Address updated successfully'});
    }catch(error){
        console.error(error);
        res.status(500).json({error:'Error updating address'});
    }
};


//Delete address
exports.deleteAddress = async (req,res)=>{
    try{
        const {id} = req.params;
        const [result] = await pool.query('DELETE FROM addresses WHERE address_id = ?', [id]);
        if (result.affectedRows === 0){
            return res.status(404).json({error:'Address not Found'});
        }
        res.status(200).json({message:'Address Deleted Successfully'})
    }catch(error){
        console.error(error);
        res.status(500).json({error:'Error deleting address'});
    }
};