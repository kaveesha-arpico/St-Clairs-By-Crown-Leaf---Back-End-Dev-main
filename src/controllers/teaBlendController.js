const prisma = require("../config/prisma");

const getTeaOptions = async (req, res) => {
  try {
    const [baseTeas, spices] = await Promise.all([
      prisma.base_teas.findMany({ select: { id: true, name: true } }),
      prisma.spices.findMany({ select: { id: true, name: true } }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        baseTeas,
        spices,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

const createCustomBlend = async (req, res) => {
  const { baseTeaId, quantity, spices } = req.body;

  if (
    !baseTeaId ||
    !quantity ||
    !Array.isArray(spices) ||
    spices.length === 0
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Please provide all required fields." });
  }

  try {
    const blend = await prisma.$transaction(async (tx) => {
      const created = await tx.custom_blends.create({
        data: { base_tea_id: baseTeaId, quantity },
        select: { id: true },
      });

      await tx.blend_spices.createMany({
        data: spices.map((spice) => ({
          blend_id: created.id,
          spice_id: spice.id,
          percentage: spice.percentage,
        })),
      });

      return created;
    });

    res.status(201).json({
      success: true,
      message: "Custom tea blend created successfully!",
      data: {
        blendId: blend.id,
      },
    });
  } catch (error) {
    console.error(error);

    // Foreign key violation -> invalid base tea or spice id.
    if (error.code === "P2003") {
      return res.status(400).json({
        success: false,
        message: "Invalid base tea or spice ID provided.",
      });
    }
    res
      .status(500)
      .json({ success: false, message: "Server Error while creating blend." });
  }
};

module.exports = {
  getTeaOptions,
  createCustomBlend,
};
