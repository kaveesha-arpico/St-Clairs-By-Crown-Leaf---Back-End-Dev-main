const pool = require('../config/db');

//CRUD Operation

//Create a new customer
exports.createCustomer = async (req,res)=>{
    try{
        const{customer_name,contact_number} = req.body;
        const [result] = await pool.query(
            'INSERT INTO customers (customer_name,contact_number) VALUES (?,?)',
            [customer_name,contact_number]
        );
        res.status(201).json({
            customer_id:result.insertId,
            customer_name,
            contact_number
        });
    }catch(error){
        console.error(error);
        res.status(500).json({error:'Error creating customer'});
    }
};

//READ all Customers
exports.getAllCustomers = async (req,res)=>{
    try{
        const[rows] = await pool.query('SELECT * FROM customers');
        res.status(200).json(rows);
    }catch(error){
        console.error(error);
        res.status(500).json({error:'Error fetching customers'});
    }
};

//Read One Customer by ID
exports.getCustomerById = async (req,res)=>{
    try{
        const {id} = req.params;
        const [rows] = await pool.query('SELECT * FROM customers WHERE customer_id = ?',[id]);
        if(rows.length === 0){
            return res.status(404).json({error:'Customer Not Found'});
        }
        res.status(200).json(rows[0]);
    }catch (error){
        console.error(error);
        res.status(500).json({error: 'Error Fetching customer'});
    }
};

//Update a Customer
exports.updateCustomer = async (req,res) =>{
    try{
        const {id} = req.params;
        const{customer_name, contact_number} = req.body;
        const[result] = await pool.query(
            'UPDATE customers SET customer_name = ?, contact_number = ? WHERE customer_id = ?',
            [customer_name,contact_number,id]
        );
        if (result.affectedRows === 0){
            return res.status(404).json({error:'Customer not found'});
        }
        res.status(200).json({message:'Customer Update Successfully'});
    }catch(error){
        console.error(error);
        res.status(500).json({error:'Error updating customer'});
    }
};

//Delete a Customer
exports.deleteCustomer = async (req,res)=>{
try{
    const{id} = req.params;
    const[result] = await pool.query('DELETE FROM customers WHERE customer_id = ?', [id]);
    if (result.affectedRows === 0){
        return res.status(404).json({error:'Customer not Fond'});
    }
    res.status(200).json({message:'Customer Deleted Successfully'});
}catch(error){
    console.error(error);
    res.status(500).json({error:'Error Deleting Customers'});
}
};